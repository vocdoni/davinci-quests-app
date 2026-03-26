import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type PropsWithChildren } from 'react'
import { WagmiProvider } from 'wagmi'
import type { AppConfig } from '../config'
import { createWalletRuntime } from '../lib/wallet'
import { WalletRuntimeContext } from './walletRuntimeContext'

type AppProvidersProps = PropsWithChildren<{
  config: AppConfig
}>

export function AppProviders({ children, config }: AppProvidersProps) {
  const [runtime] = useState(() => createWalletRuntime(config))

  return (
    <WalletRuntimeContext.Provider value={runtime}>
      <WagmiProvider config={runtime.wagmiConfig}>
        <QueryClientProvider client={runtime.queryClient}>
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    </WalletRuntimeContext.Provider>
  )
}
