// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import {
  emptyOnchainStats,
  fetchOnchainUserStats,
} from './processRegistry.mjs'

describe('process registry helpers', () => {
  it('returns empty stats when the wallet has no created processes', async () => {
    const client = {
      getLogs: vi.fn(async () => []),
    }
    const processRegistry = {
      getProcess: vi.fn(),
    }
    const sequencerApi = {
      getMetadata: vi.fn(),
    }

    await expect(
      fetchOnchainUserStats({
        client,
        contractAddress: '0x0000000000000000000000000000000000000001',
        creatorAddress: '0x123400000000000000000000000000000000abcd',
        processRegistry,
        sequencerApi,
        startBlock: 12345n,
      }),
    ).resolves.toEqual(emptyOnchainStats)

    expect(processRegistry.getProcess).not.toHaveBeenCalled()
    expect(sequencerApi.getMetadata).not.toHaveBeenCalled()
  })

  it('counts only AskTheWorld processes when computing onchain stats', async () => {
    const askTheWorldProcessId = `0x${'1'.repeat(62)}`
    const foreignProcessId = `0x${'2'.repeat(62)}`
    const missingMetadataProcessId = `0x${'3'.repeat(62)}`
    const client = {
      getLogs: vi.fn(async () => [
        { args: { processId: askTheWorldProcessId } },
        { args: { processId: foreignProcessId } },
        { args: { processId: askTheWorldProcessId } },
        { args: { processId: missingMetadataProcessId } },
      ]),
    }
    const processRegistry = {
      getProcess: vi.fn(async (processId) => {
        if (processId === askTheWorldProcessId) {
          return {
            metadataURI: 'https://sequencer.example.org/metadata/ask',
            organizationId: '0x123400000000000000000000000000000000ABCD',
            votersCount: 7n,
          }
        }

        if (processId === foreignProcessId) {
          return {
            metadataURI: 'https://sequencer.example.org/metadata/foreign',
            organizationId: '0x0000000000000000000000000000000000000001',
            votersCount: 99n,
          }
        }

        return {
          metadataURI: '',
          organizationId: '0x123400000000000000000000000000000000abcd',
          votersCount: 21n,
        }
      }),
    }
    const sequencerApi = {
      getMetadata: vi.fn(async (metadataUri) => {
        if (metadataUri.endsWith('/ask')) {
          return {
            meta: {
              listInExplore: 'false',
              network: 'celo',
              origin: 'asktheworld-miniapp',
              selfConfig: {
                countries: ['ESP'],
                country: 'ESP',
                minAge: '18',
                scope: 'ESP_18_scope',
              },
            },
          }
        }

        return {
          meta: {
            listInExplore: 'false',
            network: 'celo',
            origin: 'another-miniapp',
            selfConfig: {
              countries: ['ESP'],
              country: 'ESP',
              minAge: '18',
              scope: 'ESP_18_scope',
            },
          },
        }
      }),
    }

    await expect(
      fetchOnchainUserStats({
        client,
        contractAddress: '0x0000000000000000000000000000000000000001',
        creatorAddress: '0x123400000000000000000000000000000000abcd',
        processRegistry,
        sequencerApi,
        startBlock: 12345n,
      }),
    ).resolves.toEqual({
      createdProcessesCount: 1,
      totalVotes: '7',
    })

    expect(processRegistry.getProcess).toHaveBeenCalledTimes(3)
    expect(processRegistry.getProcess).toHaveBeenCalledWith(askTheWorldProcessId)
    expect(processRegistry.getProcess).toHaveBeenCalledWith(foreignProcessId)
    expect(processRegistry.getProcess).toHaveBeenCalledWith(missingMetadataProcessId)
    expect(sequencerApi.getMetadata).toHaveBeenCalledTimes(1)
    expect(client.getLogs).toHaveBeenCalledWith({
      address: '0x0000000000000000000000000000000000000001',
      event: expect.any(Object),
      fromBlock: 12345n,
      toBlock: 'latest',
    })
  })

  it('skips processes whose metadata cannot be fetched', async () => {
    const askTheWorldProcessId = `0x${'4'.repeat(62)}`
    const brokenMetadataProcessId = `0x${'5'.repeat(62)}`
    const client = {
      getLogs: vi.fn(async () => [
        { args: { processId: askTheWorldProcessId } },
        { args: { processId: brokenMetadataProcessId } },
      ]),
    }
    const processRegistry = {
      getProcess: vi.fn(async (processId) => ({
        metadataURI: `https://sequencer.example.org/metadata/${processId}`,
        organizationId: '0x123400000000000000000000000000000000abcd',
        votersCount: processId === askTheWorldProcessId ? 4n : 80n,
      })),
    }
    const sequencerApi = {
      getMetadata: vi.fn(async (metadataUri) => {
        if (metadataUri.endsWith(brokenMetadataProcessId)) {
          throw new Error('Metadata gateway timeout.')
        }

        return {
          meta: {
            listInExplore: 'false',
            network: 'celo',
            origin: 'asktheworld-miniapp',
            selfConfig: {
              countries: ['ESP'],
              country: 'ESP',
              minAge: '18',
              scope: 'ESP_18_scope',
            },
          },
        }
      }),
    }

    await expect(
      fetchOnchainUserStats({
        client,
        contractAddress: '0x0000000000000000000000000000000000000001',
        creatorAddress: '0x123400000000000000000000000000000000abcd',
        processRegistry,
        sequencerApi,
        startBlock: 12345n,
      }),
    ).resolves.toEqual({
      createdProcessesCount: 1,
      totalVotes: '4',
    })

    expect(sequencerApi.getMetadata).toHaveBeenCalledTimes(2)
  })
})
