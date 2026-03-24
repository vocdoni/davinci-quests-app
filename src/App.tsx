import { useEffect, useEffectEvent, useRef } from 'react'
import type { AppConfig } from './config'
import { useDiscordConnection } from './hooks/useDiscordConnection'
import { useTelegramConnection } from './hooks/useTelegramConnection'
import { useUserStats } from './hooks/useUserStats'
import { useWalletConnection } from './hooks/useWalletConnection'
import './App.css'

type AppProps = {
  config: AppConfig
}

type StatsPayload = {
  discord: {
    isAuthenticated: boolean
    isInTargetServer: boolean | null
    userId: string | null
    username: string | null
  }
  telegram: {
    displayName: string | null
    isAuthenticated: boolean
    isInTargetChannel: boolean | null
    userId: string | null
    username: string | null
  }
  onchain: {
    address: string
    numberOfProcesses: number
    totalVotes: string
  }
}

function formatTableValue(value: boolean | number | string | null) {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  return String(value)
}

function getStatsPayload({
  discord,
  stats,
  telegram,
  wallet,
}: {
  discord: ReturnType<typeof useDiscordConnection>
  stats: ReturnType<typeof useUserStats>
  telegram: ReturnType<typeof useTelegramConnection>
  wallet: ReturnType<typeof useWalletConnection>
}): StatsPayload | null {
  if (
    !wallet.isConnected ||
    !wallet.address ||
    !stats.isSuccess ||
    !discord.isReady ||
    !telegram.isReady
  ) {
    return null
  }

  return {
    discord: {
      isAuthenticated: discord.isAuthenticated,
      isInTargetServer: discord.isInTargetServer,
      userId: discord.userId,
      username: discord.displayName ?? discord.username,
    },
    telegram: {
      displayName: telegram.displayName,
      isAuthenticated: telegram.isAuthenticated,
      isInTargetChannel: telegram.isInTargetChannel,
      userId: telegram.userId,
      username: telegram.username,
    },
    onchain: {
      address: wallet.address,
      numberOfProcesses: stats.data.createdProcessesCount,
      totalVotes: stats.data.totalVotersAcrossCreatedProcesses.toString(),
    },
  }
}

function App({ config }: AppProps) {
  const wallet = useWalletConnection(config)
  const discord = useDiscordConnection(config)
  const telegram = useTelegramConnection(config)
  const stats = useUserStats({
    address: wallet.address,
    enabled: wallet.isConnected && !wallet.isWrongNetwork,
  })
  const attemptedAutoSwitchRef = useRef<string | null>(null)
  const lastLoggedStatsRef = useRef<string | null>(null)
  const lastTelegramErrorRef = useRef<string | null>(null)
  const payload = getStatsPayload({
    discord,
    stats,
    telegram,
    wallet,
  })
  const tableRows = payload
    ? [
        ['discord', 'isAuthenticated', formatTableValue(payload.discord.isAuthenticated)],
        ['discord', 'isInTargetServer', formatTableValue(payload.discord.isInTargetServer)],
        ['discord', 'userId', formatTableValue(payload.discord.userId)],
        ['discord', 'username', formatTableValue(payload.discord.username)],
        ['telegram', 'displayName', formatTableValue(payload.telegram.displayName)],
        ['telegram', 'isAuthenticated', formatTableValue(payload.telegram.isAuthenticated)],
        [
          'telegram',
          'isInTargetChannel',
          formatTableValue(payload.telegram.isInTargetChannel),
        ],
        ['telegram', 'userId', formatTableValue(payload.telegram.userId)],
        ['telegram', 'username', formatTableValue(payload.telegram.username)],
        ['onchain', 'address', formatTableValue(payload.onchain.address)],
        [
          'onchain',
          'numberOfProcesses',
          formatTableValue(payload.onchain.numberOfProcesses),
        ],
        ['onchain', 'totalVotes', formatTableValue(payload.onchain.totalVotes)],
      ]
    : null

  const requestAutoSwitch = useEffectEvent(() => {
    void wallet.requestSwitch()
  })

  useEffect(() => {
    if (!wallet.isConnected || !wallet.isWrongNetwork || wallet.isSwitching) {
      return
    }

    const attemptKey = `${wallet.address ?? 'unknown'}:${wallet.chainId ?? 'none'}`
    if (attemptedAutoSwitchRef.current === attemptKey) {
      return
    }

    attemptedAutoSwitchRef.current = attemptKey
    requestAutoSwitch()
  }, [
    wallet.address,
    wallet.chainId,
    wallet.isConnected,
    wallet.isSwitching,
    wallet.isWrongNetwork,
  ])

  useEffect(() => {
    if (!wallet.isWrongNetwork) {
      attemptedAutoSwitchRef.current = null
    }
  }, [wallet.isWrongNetwork])

  useEffect(() => {
    if (!wallet.isConnected) {
      lastLoggedStatsRef.current = null
    }
  }, [wallet.isConnected])

  useEffect(() => {
    const nextTelegramError =
      telegram.isReady && telegram.error ? telegram.error : null

    if (!nextTelegramError) {
      lastTelegramErrorRef.current = null
      return
    }

    if (lastTelegramErrorRef.current === nextTelegramError) {
      return
    }

    lastTelegramErrorRef.current = nextTelegramError
    console.warn('Telegram status', {
      error: nextTelegramError,
      isAuthenticated: telegram.isAuthenticated,
      isInTargetChannel: telegram.isInTargetChannel,
      userId: telegram.userId,
      username: telegram.username,
    })
  }, [
    telegram.error,
    telegram.isAuthenticated,
    telegram.isInTargetChannel,
    telegram.isReady,
    telegram.userId,
    telegram.username,
  ])

  useEffect(() => {
    if (!payload) {
      return
    }
    const signature = JSON.stringify(payload)

    if (lastLoggedStatsRef.current === signature) {
      return
    }

    lastLoggedStatsRef.current = signature
    console.log('User stats', payload)
  }, [
    payload,
  ])

  return (
    <main className="dashboard-shell">
      <div className="app-stack">
        <div className="button-stack">
          <button
            className="minimal-button"
            disabled={
              wallet.isConnecting ||
              wallet.isSwitching ||
              (!wallet.isConnected && wallet.connectors.length === 0)
            }
            onClick={() => {
              if (wallet.isConnected) {
                wallet.disconnectWallet()
                return
              }

              void wallet.connectPrimaryWallet()
            }}
            type="button"
          >
            {wallet.isConnecting
              ? 'Connecting wallet...'
              : wallet.isSwitching
                ? 'Switching network...'
                : wallet.isConnected
                  ? 'Disconnect wallet'
                  : 'Connect wallet'}
          </button>
          <button
            className="minimal-button discord-button"
            disabled={discord.isLoading}
            onClick={() => {
              if (discord.isAuthenticated) {
                discord.logout()
                return
              }

              void discord.login()
            }}
            type="button"
          >
            {discord.isLoading
              ? 'Connecting Discord...'
              : discord.isAuthenticated
                ? 'Disconnect Discord'
                : 'Login with Discord'}
          </button>
          <button
            className="minimal-button telegram-button"
            disabled={telegram.isLoading}
            onClick={() => {
              if (telegram.isAuthenticated) {
                telegram.logout()
                return
              }

              void telegram.login()
            }}
            type="button"
          >
            {telegram.isLoading
              ? 'Connecting Telegram...'
              : telegram.isAuthenticated
                ? 'Disconnect Telegram'
                : 'Login with Telegram'}
          </button>
        </div>

        {tableRows ? (
          <div className="stats-table-shell">
            <table className="stats-table">
              <thead>
                <tr>
                  <th scope="col">Section</th>
                  <th scope="col">Field</th>
                  <th scope="col">Value</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map(([section, field, value]) => (
                  <tr key={`${section}-${field}`}>
                    <td>{section}</td>
                    <td>{field}</td>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </main>
  )
}

export default App
