import { createPublicClient, http } from 'viem'
import { ProcessRegistry__factory } from '@vocdoni/davinci-contracts'

const processRegistryAbi = ProcessRegistry__factory.abi

const processCreatedEvent = processRegistryAbi.find(
  (entry) => entry.type === 'event' && entry.name === 'ProcessCreated',
)
const PROCESS_READ_BATCH_SIZE = 20

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

  return {
    fetchUserStats: (walletAddress) =>
      fetchOnchainUserStats({
        client,
        contractAddress: config.onchain.contractAddress,
        creatorAddress: walletAddress,
        startBlock: config.onchain.startBlock,
      }),
  }
}

export async function fetchOnchainUserStats({
  client,
  contractAddress,
  creatorAddress,
  startBlock,
}) {
  const logs = await client.getLogs({
    address: contractAddress,
    args: { creator: creatorAddress },
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

  for (const batch of createProcessIdBatches(processIds)) {
    const batchResults = await Promise.all(
      batch.map((processId) =>
        client.readContract({
          abi: processRegistryAbi,
          address: contractAddress,
          args: [processId],
          functionName: 'getProcess',
        }),
      ),
    )

    totalVotes += batchResults.reduce(
      (sum, process) => sum + process.votersCount,
      0n,
    )
  }

  return {
    createdProcessesCount: processIds.length,
    totalVotes: totalVotes.toString(),
  }
}
