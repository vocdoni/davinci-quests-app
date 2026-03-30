// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { resolveEnsNameForAddress } from './ens.mjs'

describe('resolveEnsNameForAddress', () => {
  it('returns the verified ens name when reverse and forward resolution agree', async () => {
    const client = {
      getEnsAddress: vi.fn(async () => '0x123400000000000000000000000000000000ABCD'),
      getEnsName: vi.fn(async () => 'alice.eth'),
    }

    const ensName = await resolveEnsNameForAddress({
      address: '0x123400000000000000000000000000000000abcd',
      client,
    })

    expect(ensName).toBe('alice.eth')
  })

  it('returns null when reverse resolution has no name', async () => {
    const client = {
      getEnsAddress: vi.fn(),
      getEnsName: vi.fn(async () => null),
    }

    const ensName = await resolveEnsNameForAddress({
      address: '0x123400000000000000000000000000000000abcd',
      client,
    })

    expect(ensName).toBeNull()
    expect(client.getEnsAddress).not.toHaveBeenCalled()
  })

  it('returns null when forward verification points to a different address', async () => {
    const client = {
      getEnsAddress: vi.fn(async () => '0x999900000000000000000000000000000000abcd'),
      getEnsName: vi.fn(async () => 'alice.eth'),
    }

    const ensName = await resolveEnsNameForAddress({
      address: '0x123400000000000000000000000000000000abcd',
      client,
    })

    expect(ensName).toBeNull()
  })
})
