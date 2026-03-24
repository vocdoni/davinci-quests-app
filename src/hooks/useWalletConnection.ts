import { useState } from 'react'
import type { Connector } from '@wagmi/core'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { numberToHex } from 'viem'
import type { AppConfig } from '../config'
import { createTargetChain } from '../lib/wallet'

type Eip1193Provider = {
  request(args: {
    method: string
    params?: unknown[] | Record<string, unknown>
  }): Promise<unknown>
}

function isEip1193Provider(provider: unknown): provider is Eip1193Provider {
  return Boolean(
    provider &&
      typeof provider === 'object' &&
      'request' in provider &&
      typeof provider.request === 'function',
  )
}

function getErrorCode(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = error.code
    if (typeof code === 'number') {
      return code
    }
  }

  return undefined
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown wallet error.'
}

function buildAddChainParams(config: AppConfig) {
  return {
    blockExplorerUrls: [config.targetChain.blockExplorerUrl],
    chainId: numberToHex(config.targetChain.id),
    chainName: config.targetChain.name,
    nativeCurrency: config.targetChain.nativeCurrency,
    rpcUrls: [config.targetChain.rpcUrl],
  }
}

function prettifySwitchError(error: unknown) {
  const errorCode = getErrorCode(error)

  if (errorCode === 4001) {
    return 'Network switch was rejected in the wallet.'
  }

  if (errorCode === 4902) {
    return 'The wallet does not know this chain yet and could not add it automatically.'
  }

  return getErrorMessage(error)
}

export function useWalletConnection(config: AppConfig) {
  const targetChain = createTargetChain(config)
  const connection = useAccount()
  const { connectAsync, connectors, error: connectError, isPending: isConnecting } =
    useConnect()
  const { disconnect } = useDisconnect()
  const [connectRequestError, setConnectRequestError] = useState<string | null>(null)
  const [isSwitching, setIsSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)

  const connectWallet = async (connector: Connector) => {
    setConnectRequestError(null)
    setSwitchError(null)

    try {
      await connectAsync({
        chainId: targetChain.id,
        connector,
      })
    } catch (error) {
      setConnectRequestError(prettifySwitchError(error))
    }
  }

  const primaryConnector =
    connectors.find((connector) => connector.id === 'injected') ??
    connectors.find((connector) => connector.id === 'walletConnect') ??
    connectors[0] ??
    null

  const connectPrimaryWallet = async () => {
    if (!primaryConnector) {
      setConnectRequestError('No compatible wallet connector is available.')
      return
    }

    await connectWallet(primaryConnector)
  }

  const requestSwitch = async () => {
    if (!connection.connector) {
      return
    }

    setIsSwitching(true)
    setSwitchError(null)

    try {
      const provider = await connection.connector.getProvider()
      if (!isEip1193Provider(provider)) {
        throw new Error(
          'Connected wallet does not support programmatic chain switching.',
        )
      }

      const switchParams = [{ chainId: numberToHex(targetChain.id) }]

      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: switchParams,
        })
      } catch (error) {
        if (getErrorCode(error) === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [buildAddChainParams(config)],
          })
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: switchParams,
          })
        } else {
          throw error
        }
      }
    } catch (error) {
      setSwitchError(prettifySwitchError(error))
    } finally {
      setIsSwitching(false)
    }
  }

  return {
    activeConnectorName: connection.connector?.name ?? null,
    address: connection.address,
    chain: connection.chain,
    chainId: connection.chainId,
    connectError:
      connectRequestError ??
      (connectError ? prettifySwitchError(connectError) : null),
    connectPrimaryWallet,
    connectWallet,
    connectors,
    disconnectWallet: disconnect,
    isConnected: connection.isConnected,
    isConnecting,
    isSwitching,
    isWrongNetwork:
      connection.isConnected && connection.chainId !== targetChain.id,
    primaryConnectorName: primaryConnector?.name ?? null,
    requestSwitch,
    switchError,
    targetChain,
  }
}
