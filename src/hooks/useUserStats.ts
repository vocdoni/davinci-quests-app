import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { fetchUserStats } from '../lib/processRegistry'
import { useWalletRuntime } from '../providers/walletRuntimeContext'

type UseUserStatsParameters = {
  address?: Address
  enabled: boolean
}

export function useUserStats({ address, enabled }: UseUserStatsParameters) {
  const { config, publicClient } = useWalletRuntime()

  return useQuery({
    enabled: enabled && Boolean(address),
    queryFn: async () => {
      if (!address) {
        throw new Error('Wallet address is required to load stats.')
      }

      return fetchUserStats({
        client: publicClient,
        contractAddress: config.contractAddress,
        creatorAddress: address,
        startBlock: config.startBlock,
      })
    },
    queryKey: [
      'user-stats',
      config.contractAddress,
      config.startBlock.toString(),
      config.targetChain.id,
      address ?? null,
    ],
  })
}
