import { JsonRpcProvider } from 'ethers'
import { Worker as NodeWorker } from 'node:worker_threads'
import { getAddress } from 'viem'
import { createPublicClient, http } from 'viem'
import { ProcessRegistry__factory } from '@vocdoni/davinci-contracts'
import { isAskTheWorldProcessMetadata } from './sequencer.mjs'

const processRegistryAbi = ProcessRegistry__factory.abi

const processCreatedEvent = processRegistryAbi.find(
  (entry) => entry.type === 'event' && entry.name === 'ProcessCreated',
)
const PROCESS_READ_BATCH_SIZE = 20

if (typeof globalThis.Worker === 'undefined') {
  globalThis.Worker = NodeWorker
}

export const emptyOnchainStats = {
  createdProcessesCount: 0,
  totalVotes: '0',
}

function dedupeProcessIds(processIds) {
  return [...new Set(processIds)]
}

function createProcessIdBatches(processIds) {
  const batches = []

  for (let index = 0; index < processIds.length; index += PROCESS_READ_BATCH_SIZE) {
    batches.push(processIds.slice(index, index + PROCESS_READ_BATCH_SIZE))
  }

  return batches
}

export function createOnchainStatsDependencies(config) {
  const client = createPublicClient({
    transport: http(config.onchain.rpcUrl),
  })
  let sdkDependenciesPromise = null

  return {
    fetchUserStats: async (walletAddress) => {
      if (!sdkDependenciesPromise) {
        sdkDependenciesPromise = (async () => {
          const { ProcessRegistryService, VocdoniApiService } = await import(
            '@vocdoni/davinci-sdk'
          )
          const provider = new JsonRpcProvider(config.onchain.rpcUrl)
          const processRegistry = new ProcessRegistryService(
            config.onchain.contractAddress,
            provider,
          )
          const api = new VocdoniApiService({
            censusURL: config.sequencer.apiUrl,
            sequencerURL: config.sequencer.apiUrl,
          })

          return {
            processRegistry,
            sequencerApi: api.sequencer,
          }
        })()
      }

      const { processRegistry, sequencerApi } = await sdkDependenciesPromise

      return fetchOnchainUserStats({
        client,
        contractAddress: config.onchain.contractAddress,
        creatorAddress: walletAddress,
        processRegistry,
        sequencerApi,
        startBlock: config.onchain.startBlock,
      })
    },
  }
}

function isSameAddress(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') {
    return false
  }

  try {
    return getAddress(left) === getAddress(right)
  } catch {
    return false
  }
}

async function resolveEligibleCreatedProcess(
  processId,
  creatorAddress,
  processRegistry,
  sequencerApi,
) {
  const process = await processRegistry.getProcess(processId)

  if (!isSameAddress(process?.organizationId, creatorAddress)) {
    return null
  }

  const metadataUri =
    typeof process?.metadataURI === 'string' ? process.metadataURI.trim() : ''

  if (!metadataUri) {
    return null
  }

  let metadata = null

  try {
    metadata = await sequencerApi.getMetadata(metadataUri)
  } catch {
    return null
  }

  return isAskTheWorldProcessMetadata(metadata) ? process : null
}

export async function fetchOnchainUserStats({
  client,
  contractAddress,
  creatorAddress,
  processRegistry,
  sequencerApi,
  startBlock,
}) {
  const logs = await client.getLogs({
    address: contractAddress,
    event: processCreatedEvent,
    fromBlock: startBlock,
    toBlock: 'latest',
  })
  const processIds = dedupeProcessIds(
    logs.flatMap((log) => (log.args.processId ? [log.args.processId] : [])),
  )

  if (processIds.length === 0) {
    return emptyOnchainStats
  }

  let totalVotes = 0n
  let createdProcessesCount = 0

  for (const batch of createProcessIdBatches(processIds)) {
    const batchResults = await Promise.all(
      batch.map((processId) =>
        resolveEligibleCreatedProcess(
          processId,
          creatorAddress,
          processRegistry,
          sequencerApi,
        ),
      ),
    )

    for (const process of batchResults) {
      if (!process) {
        continue
      }

      createdProcessesCount += 1
      totalVotes += process.votersCount
    }
  }

  return {
    createdProcessesCount,
    totalVotes: totalVotes.toString(),
  }
}
