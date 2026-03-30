import { createPublicClient, getAddress, http } from 'viem'
import { mainnet } from 'viem/chains'

export function createEnsDependencies(config) {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(config.ens.rpcUrl),
  })

  return {
    resolveEnsName: (address) =>
      resolveEnsNameForAddress({
        address,
        client,
      }),
  }
}

export async function resolveEnsNameForAddress({ address, client }) {
  const normalizedAddress = getAddress(address)

  let ensName = null

  try {
    ensName = await client.getEnsName({
      address: normalizedAddress,
    })
  } catch {
    return null
  }

  if (!ensName) {
    return null
  }

  try {
    const forwardResolvedAddress = await client.getEnsAddress({
      name: ensName,
    })

    if (!forwardResolvedAddress) {
      return null
    }

    return getAddress(forwardResolvedAddress) === normalizedAddress ? ensName : null
  } catch {
    return null
  }
}
