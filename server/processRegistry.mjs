import { createPublicClient, http } from 'viem'

const processRegistryAbi = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes31',
        name: 'processId',
        type: 'bytes31',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'creator',
        type: 'address',
      },
    ],
    name: 'ProcessCreated',
    type: 'event',
  },
  {
    inputs: [
      {
        internalType: 'bytes31',
        name: 'processId',
        type: 'bytes31',
      },
    ],
    name: 'getProcess',
    outputs: [
      {
        components: [
          {
            internalType: 'uint8',
            name: 'status',
            type: 'uint8',
          },
          {
            internalType: 'address',
            name: 'organizationId',
            type: 'address',
          },
          {
            components: [
              {
                internalType: 'uint256',
                name: 'x',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'y',
                type: 'uint256',
              },
            ],
            internalType: 'tuple',
            name: 'encryptionKey',
            type: 'tuple',
          },
          {
            internalType: 'uint256',
            name: 'latestStateRoot',
            type: 'uint256',
          },
          {
            internalType: 'uint256[]',
            name: 'result',
            type: 'uint256[]',
          },
          {
            internalType: 'uint256',
            name: 'startTime',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'duration',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'maxVoters',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'votersCount',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'overwrittenVotesCount',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'creationBlock',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'batchNumber',
            type: 'uint256',
          },
          {
            internalType: 'string',
            name: 'metadataURI',
            type: 'string',
          },
          {
            components: [
              {
                internalType: 'bool',
                name: 'costFromWeight',
                type: 'bool',
              },
              {
                internalType: 'bool',
                name: 'uniqueValues',
                type: 'bool',
              },
              {
                internalType: 'uint8',
                name: 'numFields',
                type: 'uint8',
              },
              {
                internalType: 'uint8',
                name: 'groupSize',
                type: 'uint8',
              },
              {
                internalType: 'uint8',
                name: 'costExponent',
                type: 'uint8',
              },
              {
                internalType: 'uint256',
                name: 'maxValue',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'minValue',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'maxValueSum',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'minValueSum',
                type: 'uint256',
              },
            ],
            internalType: 'tuple',
            name: 'ballotMode',
            type: 'tuple',
          },
          {
            components: [
              {
                internalType: 'uint8',
                name: 'censusOrigin',
                type: 'uint8',
              },
              {
                internalType: 'bytes32',
                name: 'censusRoot',
                type: 'bytes32',
              },
              {
                internalType: 'address',
                name: 'contractAddress',
                type: 'address',
              },
              {
                internalType: 'string',
                name: 'censusURI',
                type: 'string',
              },
              {
                internalType: 'bool',
                name: 'onchainAllowAnyValidRoot',
                type: 'bool',
              },
            ],
            internalType: 'tuple',
            name: 'census',
            type: 'tuple',
          },
        ],
        internalType: 'tuple',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
]

const processCreatedEvent = processRegistryAbi[0]
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
