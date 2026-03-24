import type { Abi } from 'viem'

export const processRegistryAbi = [
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
] as const satisfies Abi

export const processCreatedEvent = processRegistryAbi[0]
