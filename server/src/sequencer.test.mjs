// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const sequencerApi = {
    getAddressWeight: vi.fn(async () => '3'),
    hasAddressVoted: vi.fn(async () => true),
    listProcesses: vi.fn(async () => [`0x${'1'.repeat(62)}`]),
  }
  const init = vi.fn(async () => undefined)
  const createRandom = vi.fn(() => ({ address: '0xabc' }))
  const DavinciSDK = vi.fn().mockImplementation(() => ({
    api: {
      sequencer: sequencerApi,
    },
    init,
  }))
  const validateProcessId = vi.fn(
    (value) => typeof value === 'string' && /^0x[0-9a-f]{62}$/u.test(value),
  )

  return {
    DavinciSDK,
    createRandom,
    init,
    sequencerApi,
    validateProcessId,
  }
})

vi.mock('@vocdoni/davinci-sdk', () => ({
  DavinciSDK: mocks.DavinciSDK,
  validateProcessId: mocks.validateProcessId,
}))

vi.mock('ethers', () => ({
  Wallet: {
    createRandom: mocks.createRandom,
  },
}))

import {
  createSequencerDependencies,
  emptySequencerSnapshot,
  mergeSequencerProcessVerification,
  normalizeSequencerSnapshot,
  SequencerApiError,
} from './sequencer.mjs'

describe('sequencer helpers', () => {
  it('normalizes stored snapshots into a predictable response shape', () => {
    expect(
      normalizeSequencerSnapshot({
        addressWeight: '5',
        error: 'Sequencer unavailable',
        hasVoted: true,
        isInCensus: false,
        lastVerifiedAt: new Date('2026-03-25T12:00:00.000Z'),
        processId: `0x${'1'.repeat(62)}`,
        status: 'verified',
      }),
    ).toEqual({
      addressWeight: '5',
      error: 'Sequencer unavailable',
      hasVoted: true,
      isConnected: true,
      isInCensus: false,
      lastVerifiedAt: '2026-03-25T12:00:00.000Z',
      numOfProcessAsParticipant: 0,
      processId: `0x${'1'.repeat(62)}`,
      processes: [
        {
          addressWeight: '5',
          error: 'Sequencer unavailable',
          hasVoted: true,
          isInCensus: false,
          lastVerifiedAt: '2026-03-25T12:00:00.000Z',
          processId: `0x${'1'.repeat(62)}`,
          status: 'verified',
        },
      ],
      status: 'verified',
      votesCasted: 1,
    })
    expect(normalizeSequencerSnapshot(null)).toEqual(emptySequencerSnapshot)
  })

  it('merges process verifications into a multi-process snapshot', () => {
    const snapshot = mergeSequencerProcessVerification(
      normalizeSequencerSnapshot(null),
      {
        addressWeight: '3',
        hasVoted: true,
        isInCensus: true,
        processId: `0x${'1'.repeat(62)}`,
      },
      '2026-03-25T12:00:00.000Z',
    )

    expect(snapshot).toMatchObject({
      addressWeight: '3',
      hasVoted: true,
      isConnected: true,
      isInCensus: true,
      numOfProcessAsParticipant: 1,
      processId: `0x${'1'.repeat(62)}`,
      processes: [
        {
          addressWeight: '3',
          hasVoted: true,
          isInCensus: true,
          lastVerifiedAt: '2026-03-25T12:00:00.000Z',
          processId: `0x${'1'.repeat(62)}`,
          status: 'verified',
        },
      ],
      votesCasted: 1,
    })
  })

  it('verifies process stats with the davinci sdk sequencer client', async () => {
    const dependencies = createSequencerDependencies({
      sequencer: {
        apiUrl: 'https://sequencer.example.org/',
      },
    })
    const processId = `0x${'1'.repeat(62)}`

    await expect(
      dependencies.verifyProcessStats({
        processId,
        walletAddress: '0x123400000000000000000000000000000000abcd',
      }),
    ).resolves.toEqual({
      addressWeight: '3',
      hasVoted: true,
      isInCensus: true,
      processId,
    })

    expect(mocks.DavinciSDK).toHaveBeenCalledWith({
      signer: expect.any(Object),
      sequencerUrl: 'https://sequencer.example.org/',
    })
    expect(mocks.init).toHaveBeenCalledTimes(1)
    expect(mocks.sequencerApi.listProcesses).toHaveBeenCalledTimes(1)
    expect(mocks.sequencerApi.getAddressWeight).toHaveBeenCalledWith(
      processId,
      '0x123400000000000000000000000000000000abcd',
    )
    expect(mocks.sequencerApi.hasAddressVoted).toHaveBeenCalledWith(
      processId,
      '0x123400000000000000000000000000000000abcd',
    )
  })

  it('throws a sequencer api error when a process is unknown', async () => {
    mocks.sequencerApi.listProcesses.mockResolvedValueOnce([])

    const dependencies = createSequencerDependencies({
      sequencer: {
        apiUrl: 'https://sequencer.example.org/',
      },
    })

    await expect(
      dependencies.verifyProcessStats({
        processId: `0x${'2'.repeat(62)}`,
        walletAddress: '0x123400000000000000000000000000000000abcd',
      }),
    ).rejects.toBeInstanceOf(SequencerApiError)
  })
})
