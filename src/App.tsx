import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { getAddress, type Address } from 'viem'
import type { AppConfig } from './config'
import { useAppSession } from './hooks/useAppSession'
import { useWalletConnection } from './hooks/useWalletConnection'
import './App.css'

type AppProps = {
  config: AppConfig
}

type StatsPayload = {
  discord: {
    checkedAt: string | null
    error: string | null
    expiresAt: string | null
    isConnected: boolean
    isInTargetServer: boolean | null
    status: string
    userId: string | null
    username: string | null
  }
  onchain: {
    address: string
    checkedAt: string | null
    error: string | null
    expiresAt: string | null
    numberOfProcesses: number
    totalVotes: string
  }
  telegram: {
    checkedAt: string | null
    displayName: string | null
    error: string | null
    expiresAt: string | null
    isConnected: boolean
    isInTargetChannel: boolean | null
    status: string
    userId: string | null
    username: string | null
  }
}

function areSameAddresses(left?: string | null, right?: string | null) {
  if (!left || !right) {
    return false
  }

  try {
    return getAddress(left) === getAddress(right)
  } catch {
    return false
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
  session,
  wallet,
}: {
  session: ReturnType<typeof useAppSession>
  wallet: ReturnType<typeof useWalletConnection>
}): StatsPayload | null {
  if (
    !wallet.isConnected ||
    !wallet.address ||
    !session.isAuthenticated ||
    !session.profile
  ) {
    return null
  }

  return {
    discord: {
      checkedAt: session.profile.identities.discord.checkedAt,
      error: session.profile.identities.discord.error,
      expiresAt: session.profile.identities.discord.expiresAt,
      isConnected: session.profile.identities.discord.connected,
      isInTargetServer: session.profile.identities.discord.stats.isInTargetServer,
      status: session.profile.identities.discord.status,
      userId: session.profile.identities.discord.userId,
      username:
        session.profile.identities.discord.displayName ??
        session.profile.identities.discord.username,
    },
    onchain: {
      address: wallet.address,
      checkedAt: session.profile.onchain.checkedAt,
      error: session.profile.onchain.error,
      expiresAt: session.profile.onchain.expiresAt,
      numberOfProcesses: session.profile.onchain.numberOfProcesses,
      totalVotes: session.profile.onchain.totalVotes,
    },
    telegram: {
      checkedAt: session.profile.identities.telegram.checkedAt,
      displayName: session.profile.identities.telegram.displayName,
      error: session.profile.identities.telegram.error,
      expiresAt: session.profile.identities.telegram.expiresAt,
      isConnected: session.profile.identities.telegram.connected,
      isInTargetChannel: session.profile.identities.telegram.stats.isInTargetChannel,
      status: session.profile.identities.telegram.status,
      userId: session.profile.identities.telegram.userId,
      username: session.profile.identities.telegram.username,
    },
  }
}

function App({ config }: AppProps) {
  const wallet = useWalletConnection(config)
  const session = useAppSession({
    apiBaseUrl: config.apiBaseUrl,
    enabled: wallet.isConnected,
    expectedWalletAddress: wallet.address as Address | undefined,
  })
  const attemptedAutoSwitchRef = useRef<string | null>(null)
  const lastLoggedStatsRef = useRef<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [providerAction, setProviderAction] = useState<'discord' | 'telegram' | null>(null)
  const payload = getStatsPayload({
    session,
    wallet,
  })
  const tableRows = payload
    ? [
        ['discord', 'checkedAt', formatTableValue(payload.discord.checkedAt)],
        ['discord', 'error', formatTableValue(payload.discord.error)],
        ['discord', 'expiresAt', formatTableValue(payload.discord.expiresAt)],
        ['discord', 'isConnected', formatTableValue(payload.discord.isConnected)],
        ['discord', 'isInTargetServer', formatTableValue(payload.discord.isInTargetServer)],
        ['discord', 'status', formatTableValue(payload.discord.status)],
        ['discord', 'userId', formatTableValue(payload.discord.userId)],
        ['discord', 'username', formatTableValue(payload.discord.username)],
        ['telegram', 'checkedAt', formatTableValue(payload.telegram.checkedAt)],
        ['telegram', 'displayName', formatTableValue(payload.telegram.displayName)],
        ['telegram', 'error', formatTableValue(payload.telegram.error)],
        ['telegram', 'expiresAt', formatTableValue(payload.telegram.expiresAt)],
        ['telegram', 'isConnected', formatTableValue(payload.telegram.isConnected)],
        [
          'telegram',
          'isInTargetChannel',
          formatTableValue(payload.telegram.isInTargetChannel),
        ],
        ['telegram', 'status', formatTableValue(payload.telegram.status)],
        ['telegram', 'userId', formatTableValue(payload.telegram.userId)],
        ['telegram', 'username', formatTableValue(payload.telegram.username)],
        ['onchain', 'address', formatTableValue(payload.onchain.address)],
        ['onchain', 'checkedAt', formatTableValue(payload.onchain.checkedAt)],
        ['onchain', 'error', formatTableValue(payload.onchain.error)],
        ['onchain', 'expiresAt', formatTableValue(payload.onchain.expiresAt)],
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
  const logoutSession = useEffectEvent(() => {
    void session.logout()
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

      if (session.sessionWalletAddress) {
        logoutSession()
      }
    }
  }, [session.sessionWalletAddress, wallet.isConnected])

  useEffect(() => {
    if (
      wallet.isConnected &&
      wallet.address &&
      session.sessionWalletAddress &&
      !areSameAddresses(wallet.address, session.sessionWalletAddress)
    ) {
      logoutSession()
    }
  }, [
    session.sessionWalletAddress,
    wallet.address,
    wallet.isConnected,
  ])

  useEffect(() => {
    setAuthError(null)
  }, [wallet.address])

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
  }, [payload])

  const handleWalletButtonClick = async () => {
    if (wallet.isConnected) {
      try {
        await session.logout()
      } catch (error) {
        console.warn('Wallet session logout failed', error)
      } finally {
        wallet.disconnectWallet()
      }
      return
    }

    await wallet.connectPrimaryWallet()
  }

  const handleWalletSignIn = async () => {
    if (!wallet.address) {
      return
    }

    setAuthError(null)
    setIsSigningIn(true)

    try {
      const challenge = await session.requestWalletChallenge(wallet.address)
      const signature = await wallet.signMessage(challenge.message)

      await session.verifyWallet(wallet.address, signature)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Wallet sign-in failed.')
    } finally {
      setIsSigningIn(false)
    }
  }

  const handleWalletSignOut = async () => {
    setAuthError(null)
    await session.logout()
  }

  const handleProviderClick = async (provider: 'discord' | 'telegram') => {
    const identity = session.profile?.identities[provider] ?? null

    if (identity?.connected) {
      setProviderAction(provider)

      try {
        await session.unlinkProvider(provider)
      } finally {
        setProviderAction(null)
      }
      return
    }

    session.startProviderConnection(provider)
  }

  const walletStatusLabel = wallet.isConnected
    ? wallet.address
    : 'Wallet not connected'
  const sessionStatusLabel = session.isAuthenticated
    ? `Signed in as ${session.sessionWalletAddress}`
    : wallet.isConnected
      ? 'Wallet connected but not signed in'
      : 'Session idle'
  const feedbackMessage = session.linkFeedback
    ? session.linkFeedback.status === 'success'
      ? `${session.linkFeedback.provider} linked successfully.`
      : session.linkFeedback.error ??
        `${session.linkFeedback.provider} could not be linked.`
    : null
  const primaryError =
    authError ??
    wallet.connectError ??
    wallet.switchError ??
    wallet.signError ??
    session.error

  return (
    <main className="dashboard-shell">
      <div className="app-stack">
        <section className="status-shell">
          <p className="status-line">Wallet: {walletStatusLabel}</p>
          <p className="status-line">Session: {sessionStatusLabel}</p>
          {wallet.isWrongNetwork ? (
            <p className="status-line status-error">
              Wrong network connected. Switching to {wallet.targetChain.name}...
            </p>
          ) : null}
          {primaryError ? (
            <p className="status-line status-error">
              {primaryError}
            </p>
          ) : null}
          {feedbackMessage ? (
            <p className="status-line status-note">
              {feedbackMessage}
              {session.linkFeedback ? (
                <button
                  className="inline-link-button"
                  onClick={session.clearLinkFeedback}
                  type="button"
                >
                  Dismiss
                </button>
              ) : null}
            </p>
          ) : null}
        </section>

        <div className="button-stack">
          <button
            className="minimal-button"
            disabled={
              isSigningIn ||
              wallet.isConnecting ||
              wallet.isSwitching ||
              (!wallet.isConnected && wallet.connectors.length === 0)
            }
            onClick={() => {
              void handleWalletButtonClick()
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
            className="minimal-button wallet-auth-button"
            disabled={
              !wallet.isConnected ||
              wallet.isWrongNetwork ||
              wallet.isConnecting ||
              wallet.isSwitching ||
              wallet.isSigning ||
              isSigningIn ||
              providerAction !== null
            }
            onClick={() => {
              void (session.isAuthenticated ? handleWalletSignOut() : handleWalletSignIn())
            }}
            type="button"
          >
            {isSigningIn || wallet.isSigning
              ? 'Signing in...'
              : session.isAuthenticated
                ? 'Sign out'
                : 'Sign in with wallet'}
          </button>
          <button
            className="minimal-button discord-button"
            disabled={
              !session.isAuthenticated ||
              providerAction === 'telegram' ||
              providerAction === 'discord'
            }
            onClick={() => {
              void handleProviderClick('discord')
            }}
            type="button"
          >
            {providerAction === 'discord'
              ? 'Updating Discord...'
              : session.profile?.identities.discord.connected
                ? 'Disconnect Discord'
                : 'Connect Discord'}
          </button>
          <button
            className="minimal-button telegram-button"
            disabled={
              !session.isAuthenticated ||
              providerAction === 'discord' ||
              providerAction === 'telegram'
            }
            onClick={() => {
              void handleProviderClick('telegram')
            }}
            type="button"
          >
            {providerAction === 'telegram'
              ? 'Updating Telegram...'
              : session.profile?.identities.telegram.connected
                ? 'Disconnect Telegram'
                : 'Connect Telegram'}
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
