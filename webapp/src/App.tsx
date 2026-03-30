import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent,
} from 'react'
import {
  Book,
  ChatBubbleQuestion,
  Leaderboard,
  Puzzle,
} from 'iconoir-react'
import { getAddress, type Address } from 'viem'
import davinciLogo from './assets/davinci-logo.png'
import type { AppConfig } from './config'
import { useLeaderboard } from './hooks/useLeaderboard'
import { useAppSession } from './hooks/useAppSession'
import type { AppProfile } from './hooks/useAppSession'
import { useQuests } from './hooks/useQuests'
import { useWalletConnection } from './hooks/useWalletConnection'
import { FaqPage } from './routes/FaqPage'
import { LeaderboardPage } from './routes/LeaderboardPage'
import { ProfilePage } from './routes/ProfilePage'
import { SequencerPage } from './routes/SequencerPage'
import { QuestsPage } from './routes/QuestsPage'
import { RulesPage } from './routes/RulesPage'
import type { ConnectionRow, ConnectionVariant, TwitterProofState } from './routes/types'
import {
  buildQuestStatsSummary,
  buildQuestAchievementContext,
  getQuestProgressHint,
  type QuestRequirementSource,
  type QuestRole,
} from './lib/quests'
import type { SequencerStats, SequencerVerification } from './hooks/useAppSession'
import './App.css'

type AppProps = {
  config: AppConfig
}

type AppPage = 'faq' | 'leaderboard' | 'profile' | 'quests' | 'rules' | 'sequencer'

type OAuthProvider = Exclude<ConnectionVariant, 'twitter'>

type StatsPayload = AppProfile['stats']

type QuestSourceConnections = Record<QuestRequirementSource, boolean>

const PROVIDER_LABELS = {
  discord: 'Discord',
  github: 'GitHub',
  telegram: 'Telegram',
  twitter: 'X',
} as const

const NAV_ITEMS: Array<{
  icon: ComponentType<{ 'aria-hidden'?: boolean; className?: string }>
  label: string
  page: Exclude<AppPage, 'profile'>
}> = [
  {
    icon: Puzzle,
    label: 'Quests',
    page: 'quests',
  },
  {
    icon: Leaderboard,
    label: 'Leaderboard',
    page: 'leaderboard',
  },
  {
    icon: Book,
    label: 'Rules',
    page: 'rules',
  },
  {
    icon: ChatBubbleQuestion,
    label: 'FAQ',
    page: 'faq',
  },
]

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

function normalizePathname(pathname: string) {
  if (!pathname) {
    return '/'
  }

  const normalized = pathname.replace(/\/+$/, '')
  return normalized === '' ? '/' : normalized
}

function getPathForPage(page: AppPage) {
  if (page === 'sequencer') {
    return '/profile/sequencer'
  }

  if (page === 'quests') {
    return '/'
  }

  return `/${page}`
}

function getPageFromPathname(pathname: string): AppPage {
  const normalizedPath = normalizePathname(pathname)

  if (normalizedPath === '/faq') {
    return 'faq'
  }

  if (normalizedPath === '/leaderboard') {
    return 'leaderboard'
  }

  if (normalizedPath === '/profile') {
    return 'profile'
  }

  if (normalizedPath === '/profile/sequencer') {
    return 'sequencer'
  }

  if (normalizedPath === '/rules') {
    return 'rules'
  }

  return 'quests'
}

function trimAddress(address?: string | null) {
  if (!address) {
    return 'Go to my profile'
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function getProviderLabel(provider: keyof typeof PROVIDER_LABELS) {
  return PROVIDER_LABELS[provider]
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

  return session.profile.stats
}

function getQuestSourceConnections({
  session,
}: {
  session: ReturnType<typeof useAppSession>
}): QuestSourceConnections {
  return {
    discord: Boolean(session.profile?.identities.discord.connected),
    github: Boolean(session.profile?.identities.github.connected),
    onchain: Boolean(session.profile?.stats.onchain.isConnected),
    sequencer: Boolean(session.profile?.stats.sequencer.processes.length),
    telegram: Boolean(session.profile?.identities.telegram.connected),
    twitter: Boolean(session.profile?.identities.twitter.connected),
  }
}

function App({ config }: AppProps) {
  const wallet = useWalletConnection(config)
  const session = useAppSession({
    apiBaseUrl: config.apiBaseUrl,
    enabled: true,
    expectedWalletAddress: wallet.address as Address | undefined,
  })
  const quests = useQuests({
    apiBaseUrl: config.apiBaseUrl,
  })
  const leaderboard = useLeaderboard({
    apiBaseUrl: config.apiBaseUrl,
  })
  const { clearLinkFeedback, linkFeedback } = session
  const attemptedAutoSwitchRef = useRef<string | null>(null)
  const lastLoggedStatsRef = useRef<string | null>(null)
  const signInWithWalletRef = useRef<() => Promise<void>>(async () => undefined)
  const [authError, setAuthError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState<AppPage>(() =>
    typeof window === 'undefined' ? 'quests' : getPageFromPathname(window.location.pathname),
  )
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [selectedQuestRole, setSelectedQuestRole] = useState<QuestRole>('supporters')
  const [isNavbarButtonHovered, setIsNavbarButtonHovered] = useState(false)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [shouldFinishNavbarLogin, setShouldFinishNavbarLogin] = useState(false)
  const [twitterError, setTwitterError] = useState<string | null>(null)
  const [twitterProof, setTwitterProof] = useState<TwitterProofState | null>(null)
  const [sequencerError, setSequencerError] = useState<string | null>(null)
  const [sequencerProcessId, setSequencerProcessId] = useState('')
  const [sequencerResult, setSequencerResult] = useState<SequencerVerification | null>(null)
  const [providerAction, setProviderAction] = useState<
    OAuthProvider | 'sequencer' | 'twitter' | null
  >(null)
  const questSourceConnections = getQuestSourceConnections({
    session,
  })
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
  signInWithWalletRef.current = async () => {
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handlePopState = () => {
      setCurrentPage(getPageFromPathname(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

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
      setShouldFinishNavbarLogin(false)
      setTwitterError(null)
      setTwitterProof(null)
      setSequencerError(null)
      setSequencerResult(null)
      setSequencerProcessId('')
    }
  }, [wallet.isConnected])

  useEffect(() => {
    if (
      wallet.isConnected &&
      wallet.address &&
      session.sessionWalletAddress &&
      !areSameAddresses(wallet.address, session.sessionWalletAddress)
    ) {
      logoutSession()
    }
  }, [session.sessionWalletAddress, wallet.address, wallet.isConnected])

  useEffect(() => {
    setAuthError(null)
    setShouldFinishNavbarLogin(false)
    setTwitterError(null)
    setTwitterProof(null)
  }, [wallet.address])

  useEffect(() => {
    if (session.profile?.identities.twitter.connected) {
      setTwitterError(null)
      setTwitterProof(null)
    }
  }, [session.profile?.identities.twitter.connected])

  const isBuilderRoleUnlocked = Boolean(session.profile?.identities.github.connected)
  const isSelectedQuestRoleLocked =
    selectedQuestRole === 'builders' && !isBuilderRoleUnlocked

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

  useEffect(() => {
    if (
      !shouldFinishNavbarLogin ||
      !wallet.isConnected ||
      !wallet.address ||
      wallet.isWrongNetwork ||
      wallet.isSwitching ||
      session.isAuthenticated ||
      isSigningIn
    ) {
      return
    }

    setShouldFinishNavbarLogin(false)
    void signInWithWalletRef.current()
  }, [
    isSigningIn,
    session.isAuthenticated,
    shouldFinishNavbarLogin,
    wallet.address,
    wallet.isConnected,
    wallet.isSwitching,
    wallet.isWrongNetwork,
  ])

  useEffect(() => {
    if (!linkFeedback || typeof window === 'undefined') {
      return
    }

    const nextPath = getPathForPage('profile')
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, document.title, nextPath)
    }

    setCurrentPage('profile')
  }, [linkFeedback])

  useEffect(() => {
    setIsMobileNavOpen(false)
  }, [currentPage])

  useEffect(() => {
    if (!linkFeedback || typeof window === 'undefined') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      clearLinkFeedback()
    }, 5000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [clearLinkFeedback, linkFeedback])

  const navigateToPage = (page: AppPage) => {
    if (typeof window === 'undefined') {
      return
    }

    setIsMobileNavOpen(false)

    const nextPath = getPathForPage(page)

    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, document.title, nextPath)
    }

    setCurrentPage(page)
  }

  const handleNavigationClick =
    (page: AppPage) => (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault()
      navigateToPage(page)
    }

  const handleNavbarLogin = async () => {
    setIsMobileNavOpen(false)

    if (session.isAuthenticated) {
      navigateToPage('profile')
      return
    }

    if (!wallet.isConnected) {
      setAuthError(null)
      setShouldFinishNavbarLogin(true)
      await wallet.connectPrimaryWallet()
      return
    }

    await signInWithWalletRef.current()
  }

  const handleWalletDisconnect = async () => {
    setAuthError(null)
    setTwitterError(null)
    setTwitterProof(null)

    if (session.sessionWalletAddress) {
      try {
        await session.logout()
      } catch (error) {
        console.warn('Wallet session logout failed', error)
      }
    }

    wallet.disconnectWallet()
  }

  const handleProviderClick = async (provider: OAuthProvider) => {
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

    setProviderAction(provider)

    try {
      session.startProviderConnection(provider)
    } catch {
      setProviderAction(null)
    }
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
      setTwitterError(error instanceof Error ? error.message : 'X code could not be generated.')
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
      setTwitterError(error instanceof Error ? error.message : 'X verification failed.')
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
      setTwitterError(error instanceof Error ? error.message : 'X could not be disconnected.')
    } finally {
      setProviderAction(null)
    }
  }

  const handleSequencerVerify = async () => {
    const normalizedProcessId = sequencerProcessId.trim()

    if (!normalizedProcessId) {
      setSequencerError('Process id is required.')
      return
    }

    setSequencerError(null)
    setProviderAction('sequencer')

    try {
      const response = await session.verifySequencerProcess(normalizedProcessId)
      setSequencerResult(response.sequencer)
      setSequencerProcessId(response.sequencer.processId ?? normalizedProcessId)
      await session.refetchProfile()
    } catch (error) {
      setSequencerError(
        error instanceof Error ? error.message : 'Process verification failed.',
      )
    } finally {
      setProviderAction(null)
    }
  }

  const feedbackMessage = linkFeedback
    ? linkFeedback.status === 'success'
      ? `${getProviderLabel(linkFeedback.provider)} linked successfully.`
      : linkFeedback.error ?? `${getProviderLabel(linkFeedback.provider)} could not be linked.`
    : null
  const primaryError =
    authError ??
    twitterError ??
    wallet.connectError ??
    wallet.switchError ??
    wallet.signError ??
    session.error
  const authenticatedNavbarLabel = trimAddress(
    session.sessionWalletAddress ?? wallet.address,
  )
  const navbarButtonLabel = session.isAuthenticated
    ? isNavbarButtonHovered
      ? 'Go to my profile'
      : authenticatedNavbarLabel
    : wallet.isConnecting
      ? 'Connecting wallet...'
      : wallet.isSwitching
        ? `Switching to ${wallet.targetChain.name}...`
        : isSigningIn || wallet.isSigning
          ? 'Signing in...'
          : wallet.isConnected
            ? 'Sign in with wallet'
            : 'Login'
  const isNavbarButtonDisabled =
    !session.isAuthenticated &&
    (wallet.isWrongNetwork ||
      wallet.isConnecting ||
      wallet.isSwitching ||
      wallet.isSigning ||
      isSigningIn ||
      providerAction !== null ||
      (!wallet.isConnected && wallet.connectors.length === 0))
  const profileRequiresSignIn = !session.isAuthenticated
  const signedAddress = session.sessionWalletAddress ?? wallet.address ?? null
  const sequencerSnapshot: SequencerStats | null = session.profile?.stats.sequencer ?? null
  const activeQuestList = quests.data?.[selectedQuestRole] ?? []
  const questAchievementContext = buildQuestAchievementContext(
    session.profile,
    quests.data,
  )
  const questCounts: Record<QuestRole, number> = {
    builders: quests.data?.builders.length ?? 0,
    supporters: quests.data?.supporters.length ?? 0,
  }
  const completedQuestIdsByRole: Record<QuestRole, Set<number>> = {
    builders: new Set(session.profile?.score.builderCompletedQuestIds ?? []),
    supporters: new Set(session.profile?.score.supporterCompletedQuestIds ?? []),
  }
  const resolvedQuests = activeQuestList.map((quest) => ({
    ...quest,
    isCompleted: completedQuestIdsByRole[selectedQuestRole].has(quest.id),
    progressHint: getQuestProgressHint(quest.achievement, questAchievementContext),
  }))
  const questProgressByRole = buildQuestStatsSummary(session.profile, quests.data)
  const totalEarnedQuestPoints = session.profile?.score.totalPoints ?? 0
  const isGithubConnected = Boolean(session.profile?.identities.github.connected)
  const questLoadingMessage = quests.isPending ? 'Loading quests...' : null
  const questErrorMessage =
    quests.error instanceof Error ? quests.error.message : 'Quests could not be loaded right now.'
  const leaderboardErrorMessage =
    leaderboard.error instanceof Error
      ? leaderboard.error.message
      : 'Leaderboard could not be loaded right now.'
  const connectionRows: ConnectionRow[] = [
    {
      isConnected: Boolean(session.profile?.identities.discord.connected),
      name: 'Discord',
      onClick: () => {
        void handleProviderClick('discord')
      },
      statusLabel:
        providerAction === 'discord'
          ? session.profile?.identities.discord.connected
            ? 'Removing...'
            : 'Connecting...'
          : 'Connect Discord',
      username:
        session.profile?.identities.discord.username ??
        session.profile?.identities.discord.displayName ??
        null,
      variant: 'discord',
    },
    {
      isConnected: Boolean(session.profile?.identities.github.connected),
      name: 'GitHub',
      onClick: () => {
        void handleProviderClick('github')
      },
      statusLabel:
        providerAction === 'github'
          ? session.profile?.identities.github.connected
            ? 'Removing...'
            : 'Connecting...'
          : 'Connect GitHub',
      username:
        session.profile?.identities.github.username ??
        session.profile?.identities.github.displayName ??
        null,
      variant: 'github',
    },
    {
      isConnected: Boolean(session.profile?.identities.telegram.connected),
      name: 'Telegram',
      onClick: () => {
        void handleProviderClick('telegram')
      },
      statusLabel:
        providerAction === 'telegram'
          ? session.profile?.identities.telegram.connected
            ? 'Removing...'
            : 'Connecting...'
          : 'Connect Telegram',
      username:
        session.profile?.identities.telegram.username ??
        session.profile?.identities.telegram.displayName ??
        null,
      variant: 'telegram',
    },
    {
      isConnected: Boolean(session.profile?.identities.twitter.connected),
      name: 'X',
      onClick: () => {
        void (
          session.profile?.identities.twitter.connected
            ? handleTwitterDisconnect()
            : handleTwitterConnect()
        )
      },
      statusLabel:
        providerAction === 'twitter'
          ? session.profile?.identities.twitter.connected
            ? 'Removing...'
            : 'Preparing proof...'
          : 'Connect X',
      username:
        session.profile?.identities.twitter.username ??
        session.profile?.identities.twitter.displayName ??
        null,
      variant: 'twitter',
    },
  ]

  let pageContent = null

  if (currentPage === 'quests') {
    pageContent = (
      <QuestsPage
        isBuilderRoleUnlocked={isBuilderRoleUnlocked}
        isGithubConnected={isGithubConnected}
        isSelectedQuestRoleLocked={isSelectedQuestRoleLocked}
        questCounts={questCounts}
        questErrorMessage={questErrorMessage}
        questLoadingMessage={questLoadingMessage}
        questProgressByRole={questProgressByRole}
        questsAreError={quests.isError}
        resolvedQuests={resolvedQuests}
        selectedQuestRole={selectedQuestRole}
        sourceConnections={questSourceConnections}
        totalEarnedQuestPoints={totalEarnedQuestPoints}
        onNavigateToProfile={() => {
          navigateToPage('profile')
        }}
        onNavigateToPath={(path) => {
          if (typeof window === 'undefined') {
            return
          }

          const normalizedPath = path === '/' ? '/' : path.replace(/\/+$/, '')
          const nextPage = getPageFromPathname(normalizedPath)
          const nextPath = getPathForPage(nextPage)

          if (window.location.pathname !== nextPath) {
            window.history.pushState(null, document.title, nextPath)
          }

          setCurrentPage(nextPage)
        }}
        onSelectQuestRole={setSelectedQuestRole}
      />
    )
  } else if (currentPage === 'leaderboard') {
    pageContent = (
      <LeaderboardPage
        errorMessage={leaderboard.isError ? leaderboardErrorMessage : null}
        isLoading={leaderboard.isPending}
        rows={leaderboard.data?.rows ?? []}
      />
    )
  } else if (currentPage === 'rules') {
    pageContent = <RulesPage />
  } else if (currentPage === 'faq') {
    pageContent = <FaqPage />
  } else if (currentPage === 'profile') {
    pageContent = (
      <ProfilePage
        connectionRows={connectionRows}
        isSessionActionDisabled={wallet.isConnecting || wallet.isSwitching || isSigningIn}
        isSignedIn={session.isAuthenticated}
        profileRequiresSignIn={profileRequiresSignIn}
        providerAction={providerAction}
        sequencerSnapshot={sequencerSnapshot}
        onNavigateToSequencer={() => {
          navigateToPage('sequencer')
        }}
        showSessionPanel={wallet.isConnected || session.isAuthenticated}
        signedAddress={signedAddress}
        twitterProof={twitterProof}
        onDisconnect={() => {
          void handleWalletDisconnect()
        }}
        onTwitterProofChange={(tweetUrl) => {
          if (!twitterProof) {
            return
          }

          setTwitterProof({
            ...twitterProof,
            tweetUrl,
          })
        }}
        onTwitterVerify={() => {
          void handleTwitterVerify()
        }}
      />
    )
  } else if (currentPage === 'sequencer') {
    pageContent = (
      <SequencerPage
        currentSnapshot={sequencerSnapshot}
        errorMessage={sequencerError}
        isSessionActionDisabled={
          wallet.isConnecting || wallet.isSwitching || isSigningIn || providerAction !== null
        }
        isSignedIn={session.isAuthenticated}
        processId={sequencerProcessId}
        profileRequiresSignIn={profileRequiresSignIn}
        recentResult={sequencerResult}
        onNavigateToProfile={() => {
          navigateToPage('profile')
        }}
        onProcessIdChange={setSequencerProcessId}
        onVerify={() => {
          void handleSequencerVerify()
        }}
      />
    )
  }

  return (
    <main className="app-shell route-page">
      <header className={`navbar-shell ${isMobileNavOpen ? 'is-mobile-open' : ''}`}>
        <a
          className="brand-link"
          href="/"
          onClick={handleNavigationClick('quests')}
        >
          <img
            alt="DaVinci logo"
            className="brand-logo-image"
            src={davinciLogo}
          />
          <span className="brand-copy">Quests</span>
        </a>

        <button
          aria-controls="primary-navigation-panel"
          aria-expanded={isMobileNavOpen}
          aria-label={isMobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="navbar-menu-toggle"
          onClick={() => {
            setIsMobileNavOpen((currentValue) => !currentValue)
          }}
          type="button"
        >
          <span
            aria-hidden="true"
            className="navbar-menu-toggle-bars"
          >
            <span className="navbar-menu-toggle-bar" />
            <span className="navbar-menu-toggle-bar" />
            <span className="navbar-menu-toggle-bar" />
          </span>
        </button>

        <div
          className="navbar-menu"
          id="primary-navigation-panel"
        >
          <nav
            aria-label="Primary navigation"
            className="nav-links"
          >
            {NAV_ITEMS.map((item) => (
              <a
                aria-current={currentPage === item.page ? 'page' : undefined}
                className={`nav-link ${currentPage === item.page ? 'is-active' : ''}`}
                href={getPathForPage(item.page)}
                key={item.page}
                onClick={handleNavigationClick(item.page)}
              >
                <item.icon
                  aria-hidden={true}
                  className="nav-link-icon"
                />
                <span>{item.label}</span>
              </a>
            ))}
          </nav>

          <button
            aria-label={navbarButtonLabel}
            className={`minimal-button nav-cta-button ${session.isAuthenticated ? 'wallet-auth-button' : ''}`}
            disabled={isNavbarButtonDisabled}
            onBlur={() => {
              setIsNavbarButtonHovered(false)
            }}
            onClick={() => {
              void handleNavbarLogin()
            }}
            onFocus={() => {
              setIsNavbarButtonHovered(true)
            }}
            onMouseEnter={() => {
              setIsNavbarButtonHovered(true)
            }}
            onMouseLeave={() => {
              setIsNavbarButtonHovered(false)
            }}
            type="button"
          >
            {session.isAuthenticated ? (
              <span
                aria-hidden="true"
                className="nav-cta-label-stack"
              >
                <span
                  className={`nav-cta-label ${isNavbarButtonHovered ? 'is-hidden' : 'is-visible'}`}
                >
                  {authenticatedNavbarLabel}
                </span>
                <span
                  className={`nav-cta-label ${isNavbarButtonHovered ? 'is-visible' : 'is-hidden'}`}
                >
                  Go to my profile
                </span>
              </span>
            ) : (
              navbarButtonLabel
            )}
          </button>
        </div>
      </header>

      <div className="page-shell">
        {wallet.isWrongNetwork ? (
          <section className="notice-banner status-error">
            Wrong network connected. Switching to {wallet.targetChain.name}...
          </section>
        ) : null}
        {primaryError ? (
          <section className="notice-banner status-error">
            {primaryError}
          </section>
        ) : null}
        {feedbackMessage ? (
          <section className="notice-banner status-note">
            <span>{feedbackMessage}</span>
            {linkFeedback ? (
              <button
                className="inline-link-button"
                onClick={clearLinkFeedback}
                type="button"
              >
                Dismiss
              </button>
            ) : null}
          </section>
        ) : null}
        {pageContent}
      </div>
    </main>
  )
}

export default App
