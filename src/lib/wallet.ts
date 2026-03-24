import { QueryClient } from '@tanstack/react-query'
import { injected, walletConnect } from 'wagmi/connectors'
import { createConfig, http } from 'wagmi'
import { createPublicClient, defineChain } from 'viem'
import type { AppConfig } from '../config'

export function createTargetChain(config: AppConfig) {
  const { targetChain } = config

  return defineChain({
    blockExplorers: {
      default: {
        name: `${targetChain.name} Explorer`,
        url: targetChain.blockExplorerUrl,
      },
    },
    id: targetChain.id,
    name: targetChain.name,
    nativeCurrency: targetChain.nativeCurrency,
    rpcUrls: {
      default: {
        http: [targetChain.rpcUrl],
      },
      public: {
        http: [targetChain.rpcUrl],
      },
    },
  })
}

export type WalletRuntime = ReturnType<typeof createWalletRuntime>

export function createWalletRuntime(config: AppConfig) {
  const targetChain = createTargetChain(config)
  const origin = globalThis.location?.origin ?? 'http://localhost:5173'
  const wagmiConfig = createConfig({
    chains: [targetChain],
    connectors: [
      walletConnect({
        metadata: {
          description: 'Track Process Registry creator stats',
          icons: [`${origin}/favicon.svg`],
          name: 'Quests Dashboard',
          url: origin,
        },
        projectId: config.walletConnectProjectId,
        showQrModal: true,
      }),
      injected(),
    ],
    transports: {
      [targetChain.id]: http(targetChain.rpcUrls.default.http[0]),
    },
  })
  const publicClient = createPublicClient({
    chain: targetChain,
    transport: http(targetChain.rpcUrls.default.http[0]),
  })
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 30_000,
      },
    },
  })

  return {
    config,
    publicClient,
    queryClient,
    targetChain,
    wagmiConfig,
  }
}
