import type { Address, Hex, PublicClient } from 'viem'
import { processCreatedEvent, processRegistryAbi } from '../abi/processRegistry'

export type CreatedProcessRow = {
  processId: Hex
  votersCount: bigint
}

export type UserStats = {
  createdProcesses: CreatedProcessRow[]
  createdProcessesCount: number
  totalVotersAcrossCreatedProcesses: bigint
}

type FetchUserStatsParameters = {
  client: PublicClient
  contractAddress: Address
  creatorAddress: Address
  startBlock: bigint
}

const PROCESS_READ_BATCH_SIZE = 20

export const emptyUserStats: UserStats = {
  createdProcesses: [],
  createdProcessesCount: 0,
  totalVotersAcrossCreatedProcesses: 0n,
}

export function dedupeProcessIds(processIds: readonly Hex[]) {
  return [...new Set(processIds)]
}

export function buildUserStats(rows: readonly CreatedProcessRow[]): UserStats {
  const createdProcesses = [...rows].sort((left, right) => {
    if (left.votersCount === right.votersCount) {
      return left.processId.localeCompare(right.processId)
    }

    return left.votersCount > right.votersCount ? -1 : 1
  })

  return {
    createdProcesses,
    createdProcessesCount: createdProcesses.length,
    totalVotersAcrossCreatedProcesses: createdProcesses.reduce(
      (total, row) => total + row.votersCount,
      0n,
    ),
  }
}

function createProcessIdBatches(processIds: readonly Hex[]) {
  const batches: Hex[][] = []

  for (let index = 0; index < processIds.length; index += PROCESS_READ_BATCH_SIZE) {
    batches.push(processIds.slice(index, index + PROCESS_READ_BATCH_SIZE))
  }

  return batches
}

export async function fetchUserStats({
  client,
  contractAddress,
  creatorAddress,
  startBlock,
}: FetchUserStatsParameters): Promise<UserStats> {
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
    return emptyUserStats
  }

  const createdProcesses: CreatedProcessRow[] = []

  for (const batch of createProcessIdBatches(processIds)) {
    const batchResults = await Promise.all(
      batch.map(async (processId) => {
        const process = await client.readContract({
          abi: processRegistryAbi,
          address: contractAddress,
          args: [processId],
          functionName: 'getProcess',
        })

        return {
          processId,
          votersCount: process.votersCount,
        }
      }),
    )

    createdProcesses.push(...batchResults)
  }

  return buildUserStats(createdProcesses)
}
