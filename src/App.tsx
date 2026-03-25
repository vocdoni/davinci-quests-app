import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { getAddress, type Address } from 'viem'
import type { AppConfig } from './config'
import { useAppSession } from './hooks/useAppSession'
import { useWalletConnection } from './hooks/useWalletConnection'
import './App.css'

type AppProps = {
  config: AppConfig
}

type TwitterProofState = {
  code: string
  expiresAt: string
  tweetUrl: string
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
  github: {
    checkedAt: string | null
    displayName: string | null
    error: string | null
    expiresAt: string | null
    isConnected: boolean
    isFollowingTargetOrganization: boolean | null
    isOlderThanOneYear: boolean | null
    publicNonForkRepositoryCount: number | null
    status: string
    targetOrganization: string | null
    targetRepositories: Array<{
      fullName: string
      isStarred: boolean | null
    }>
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
  twitter: {
    checkedAt: string | null
    displayName: string | null
    error: string | null
    expiresAt: string | null
    isConnected: boolean
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
    github: {
      checkedAt: session.profile.identities.github.checkedAt,
      displayName: session.profile.identities.github.displayName,
      error: session.profile.identities.github.error,
      expiresAt: session.profile.identities.github.expiresAt,
      isConnected: session.profile.identities.github.connected,
      isFollowingTargetOrganization:
        session.profile.identities.github.stats.isFollowingTargetOrganization,
      isOlderThanOneYear: session.profile.identities.github.stats.isOlderThanOneYear,
      publicNonForkRepositoryCount:
        session.profile.identities.github.stats.publicNonForkRepositoryCount,
      status: session.profile.identities.github.status,
      targetOrganization: session.profile.identities.github.stats.targetOrganization,
      targetRepositories: session.profile.identities.github.stats.targetRepositories,
      userId: session.profile.identities.github.userId,
      username: session.profile.identities.github.username,
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
    twitter: {
      checkedAt: session.profile.identities.twitter.checkedAt,
      displayName: session.profile.identities.twitter.displayName,
      error: session.profile.identities.twitter.error,
      expiresAt: session.profile.identities.twitter.expiresAt,
      isConnected: session.profile.identities.twitter.connected,
      status: session.profile.identities.twitter.status,
      userId: session.profile.identities.twitter.userId,
      username: session.profile.identities.twitter.username,
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
  const [twitterError, setTwitterError] = useState<string | null>(null)
  const [twitterProof, setTwitterProof] = useState<TwitterProofState | null>(null)
  const [providerAction, setProviderAction] = useState<
    'discord' | 'github' | 'telegram' | 'twitter' | null
  >(null)
  const payload = getStatsPayload({
    session,
    wallet,
  })
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
      setTwitterError(null)
      setTwitterProof(null)

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
    setTwitterError(null)
    setTwitterProof(null)
  }, [wallet.address])

  useEffect(() => {
    if (session.profile?.identities.twitter.connected) {
      setTwitterError(null)
      setTwitterProof(null)
    }
  }, [session.profile?.identities.twitter.connected])

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
    setTwitterError(null)
    setTwitterProof(null)
    await session.logout()
  }

  const handleProviderClick = async (provider: 'discord' | 'github' | 'telegram') => {
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

  const handleTwitterConnect = async () => {
    setTwitterError(null)
    setProviderAction('twitter')

    try {
      const nextProof = await session.requestTwitterCode()
      setTwitterProof({
        code: nextProof.code,
        expiresAt: nextProof.expiresAt,
        tweetUrl: '',
      })
    } catch (error) {
      setTwitterError(error instanceof Error ? error.message : 'Twitter code could not be generated.')
    } finally {
      setProviderAction(null)
    }
  }

  const handleTwitterVerify = async () => {
    if (!twitterProof) {
      return
    }

    setTwitterError(null)
    setProviderAction('twitter')

    try {
      await session.verifyTwitterTweet(twitterProof.tweetUrl)
      setTwitterProof(null)
    } catch (error) {
      setTwitterError(error instanceof Error ? error.message : 'Twitter verification failed.')
    } finally {
      setProviderAction(null)
    }
  }

  const handleTwitterDisconnect = async () => {
    setTwitterError(null)
    setProviderAction('twitter')

    try {
      await session.unlinkProvider('twitter')
      setTwitterProof(null)
    } catch (error) {
      setTwitterError(error instanceof Error ? error.message : 'Twitter could not be disconnected.')
    } finally {
      setProviderAction(null)
    }
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
    twitterError ??
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
              providerAction !== null
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
            className="minimal-button github-button"
            disabled={
              !session.isAuthenticated ||
              providerAction !== null
            }
            onClick={() => {
              void handleProviderClick('github')
            }}
            type="button"
          >
            {providerAction === 'github'
              ? 'Updating GitHub...'
              : session.profile?.identities.github.connected
                ? 'Disconnect GitHub'
                : 'Connect GitHub'}
          </button>
          <button
            className="minimal-button telegram-button"
            disabled={
              !session.isAuthenticated ||
              providerAction !== null
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
          <button
            className="minimal-button twitter-button"
            disabled={
              !session.isAuthenticated ||
              providerAction !== null
            }
            onClick={() => {
              if (session.profile?.identities.twitter.connected) {
                void handleTwitterDisconnect()
                return
              }

              void handleTwitterConnect()
            }}
            type="button"
          >
            {providerAction === 'twitter'
              ? 'Updating Twitter...'
              : session.profile?.identities.twitter.connected
                ? 'Disconnect Twitter'
                : twitterProof
                  ? 'Refresh Twitter code'
                  : 'Connect Twitter'}
          </button>
        </div>
        {session.isAuthenticated && !session.profile?.identities.twitter.connected && twitterProof ? (
          <div className="twitter-proof-shell">
            <p className="status-line status-note">
              Tweet this proof code from the Twitter account you want to link.
            </p>
            <p className="twitter-proof-code">
              {twitterProof.code}
            </p>
            <p className="status-line">
              Code expires at: {new Date(twitterProof.expiresAt).toLocaleString()}
            </p>
            <label className="twitter-proof-label" htmlFor="twitter-proof-url">
              Tweet URL
            </label>
            <input
              className="twitter-proof-input"
              disabled={providerAction !== null}
              id="twitter-proof-url"
              onChange={(event) => {
                setTwitterProof((currentProof) =>
                  currentProof
                    ? {
                        ...currentProof,
                        tweetUrl: event.target.value,
                      }
                    : currentProof,
                )
              }}
              placeholder="https://x.com/your-handle/status/1234567890"
              type="url"
              value={twitterProof.tweetUrl}
            />
            <button
              className="minimal-button twitter-verify-button"
              disabled={
                providerAction !== null ||
                twitterProof.tweetUrl.trim().length === 0
              }
              onClick={() => {
                void handleTwitterVerify()
              }}
              type="button"
            >
              {providerAction === 'twitter' ? 'Verifying tweet...' : 'Verify tweet'}
            </button>
          </div>
        ) : null}
      </div>
    </main>
  )
}

export default App
