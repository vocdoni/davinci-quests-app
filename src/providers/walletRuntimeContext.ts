import { createContext, useContext } from 'react'
import type { WalletRuntime } from '../lib/wallet'

export const WalletRuntimeContext = createContext<WalletRuntime | null>(null)

export function useWalletRuntime() {
  const runtime = useContext(WalletRuntimeContext)

  if (!runtime) {
    throw new Error('useWalletRuntime must be used within AppProviders.')
  }

  return runtime
}
