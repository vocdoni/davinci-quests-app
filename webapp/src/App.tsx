import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { getAddress, type Address } from 'viem'
import davinciLogo from './assets/davinci-logo.png'
import type { AppConfig } from './config'
import { useAppSession } from './hooks/useAppSession'
import { useQuests } from './hooks/useQuests'
import { useWalletConnection } from './hooks/useWalletConnection'
import {
  buildQuestAchievementContext,
  evaluateQuestAchievement,
  type QuestRole,
} from './lib/quests'
import './App.css'

type AppProps = {
  config: AppConfig
}

type AppPage = 'faq' | 'leaderboard' | 'profile' | 'quests' | 'rules'

type OAuthProvider = 'discord' | 'github' | 'telegram'

type TwitterProofState = {
  code: string
  expiresAt: string
  tweetUrl: string
}

type StatsPayload = {
  discord: {
    error: string | null
    isConnected: boolean
    isInTargetServer: boolean | null
    status: string
    userId: string | null
    username: string | null
  }
  github: {
    displayName: string | null
    error: string | null
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
    error: string | null
    numberOfProcesses: number
    totalVotes: string
  }
  telegram: {
    displayName: string | null
    error: string | null
    isConnected: boolean
    isInTargetChannel: boolean | null
    status: string
    userId: string | null
    username: string | null
  }
  twitter: {
    displayName: string | null
    error: string | null
    isConnected: boolean
    status: string
    userId: string | null
    username: string | null
  }
}

const PROVIDER_LABELS = {
  discord: 'Discord',
  github: 'GitHub',
  telegram: 'Telegram',
  twitter: 'X',
} as const

const NAV_ITEMS: Array<{
  label: string
  page: Exclude<AppPage, 'profile'>
}> = [
  {
    label: 'Quests',
    page: 'quests',
  },
  {
    label: 'Leaderboard',
    page: 'leaderboard',
  },
  {
    label: 'Rules',
    page: 'rules',
  },
  {
    label: 'FAQ',
    page: 'faq',
  },
]

const QUEST_ROLE_LABELS: Record<QuestRole, string> = {
  builders: 'Builders',
  supporters: 'Supporters',
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

function normalizePathname(pathname: string) {
  if (!pathname) {
    return '/'
  }

  const normalized = pathname.replace(/\/+$/, '')
  return normalized === '' ? '/' : normalized
}

function getPathForPage(page: AppPage) {
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

function getQuestRoleDescription(role: QuestRole) {
  return role === 'builders'
    ? 'Builder quests are for contributors who unlocked the role by connecting GitHub.'
    : 'Supporter quests are open to everyone and help you get started with the community.'
}

function getQuestCountLabel(count: number) {
  return `${count} quest${count === 1 ? '' : 's'} available`
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
      error: session.profile.identities.discord.error,
      isConnected: session.profile.identities.discord.connected,
      isInTargetServer: session.profile.identities.discord.stats.isInTargetServer,
      status: session.profile.identities.discord.status,
      userId: session.profile.identities.discord.userId,
      username:
        session.profile.identities.discord.displayName ??
        session.profile.identities.discord.username,
    },
    github: {
      displayName: session.profile.identities.github.displayName,
      error: session.profile.identities.github.error,
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
      error: session.profile.onchain.error,
      numberOfProcesses: session.profile.onchain.numberOfProcesses,
      totalVotes: session.profile.onchain.totalVotes,
    },
    telegram: {
      displayName: session.profile.identities.telegram.displayName,
      error: session.profile.identities.telegram.error,
      isConnected: session.profile.identities.telegram.connected,
      isInTargetChannel: session.profile.identities.telegram.stats.isInTargetChannel,
      status: session.profile.identities.telegram.status,
      userId: session.profile.identities.telegram.userId,
      username: session.profile.identities.telegram.username,
    },
    twitter: {
      displayName: session.profile.identities.twitter.displayName,
      error: session.profile.identities.twitter.error,
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
    enabled: true,
    expectedWalletAddress: wallet.address as Address | undefined,
  })
  const quests = useQuests({
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
  const [selectedQuestRole, setSelectedQuestRole] = useState<QuestRole>('supporters')
  const [isNavbarButtonHovered, setIsNavbarButtonHovered] = useState(false)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [shouldFinishNavbarLogin, setShouldFinishNavbarLogin] = useState(false)
  const [twitterError, setTwitterError] = useState<string | null>(null)
  const [twitterProof, setTwitterProof] = useState<TwitterProofState | null>(null)
  const [providerAction, setProviderAction] = useState<
    OAuthProvider | 'twitter' | null
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
  const questAchievementContext = buildQuestAchievementContext(session.profile)
  const activeQuestList = quests.data?.[selectedQuestRole] ?? []
  const allQuestLists: Record<QuestRole, typeof activeQuestList> = {
    builders: quests.data?.builders ?? [],
    supporters: quests.data?.supporters ?? [],
  }
  const questCounts: Record<QuestRole, number> = {
    builders: quests.data?.builders.length ?? 0,
    supporters: quests.data?.supporters.length ?? 0,
  }
  const resolvedQuests = activeQuestList.map((quest) => ({
    ...quest,
    isCompleted: evaluateQuestAchievement(quest.achievement, questAchievementContext),
  }))
  const questProgressByRole = (['supporters', 'builders'] as QuestRole[]).reduce(
    (progress, role) => {
      const questsForRole = allQuestLists[role].map((quest) => ({
        ...quest,
        isCompleted: evaluateQuestAchievement(quest.achievement, questAchievementContext),
      }))

      progress[role] = {
        completedCount: questsForRole.filter((quest) => quest.isCompleted).length,
        earnedPoints: questsForRole.reduce(
          (total, quest) => total + (quest.isCompleted ? quest.points : 0),
          0,
        ),
        totalCount: questsForRole.length,
      }

      return progress
    },
    {} as Record<
      QuestRole,
      {
        completedCount: number
        earnedPoints: number
        totalCount: number
      }
    >,
  )
  const totalEarnedQuestPoints =
    questProgressByRole.supporters.earnedPoints + questProgressByRole.builders.earnedPoints
  const isGithubConnected = Boolean(session.profile?.identities.github.connected)
  const questLoadingMessage = quests.isPending ? 'Loading quests...' : null
  const questErrorMessage =
    quests.error instanceof Error ? quests.error.message : 'Quests could not be loaded right now.'
  const connectionRows: Array<{
    isConnected: boolean
    name: string
    onClick: () => void
    statusLabel: string
    username: string | null
    variant: 'discord' | 'github' | 'telegram' | 'twitter'
  }> = [
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

  return (
    <main className="app-shell route-page">
      <header className="navbar-shell">
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
              {item.label}
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

        {currentPage === 'quests' ? (
          <section className="profile-stack">
            <div className="content-panel page-panel">
              <p className="section-eyebrow">Quests</p>
              <h1 className="page-title">Complete quests and earn points.</h1>
              <p className="body-copy">
                Choose the role that fits you best. Supporters are open to everyone,
                while Builder quests unlock after you connect GitHub from your
                profile.
              </p>

              <div
                aria-label="Quest roles"
                className="quest-role-picker"
                role="tablist"
              >
                {(['supporters', 'builders'] as QuestRole[]).map((role) => {
                  const isLocked = role === 'builders' && !isBuilderRoleUnlocked
                  const isSelected = selectedQuestRole === role
                  const questCountLabel = quests.isPending
                    ? 'Loading quests...'
                    : getQuestCountLabel(questCounts[role])

                  return (
                    <article
                      aria-selected={isSelected}
                      className={`quest-role-card ${isSelected ? 'is-active' : ''} ${isLocked ? 'is-locked' : ''}`}
                      key={role}
                      onClick={() => {
                        setSelectedQuestRole(role)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedQuestRole(role)
                        }
                      }}
                      role="tab"
                      tabIndex={0}
                    >
                      <div className="quest-role-card-copy">
                        <div className="quest-role-card-header">
                          <h2 className="quest-role-card-title">
                            {QUEST_ROLE_LABELS[role]}
                          </h2>
                          {isSelected ? (
                            <span className="quest-role-selected-badge">Selected</span>
                          ) : null}
                        </div>

                        <p className="quest-role-card-description">
                          {getQuestRoleDescription(role)}
                        </p>

                        {role === 'builders' && !isBuilderRoleUnlocked ? (
                          <div className="quest-role-lockout">
                            <span>Connect your GitHub account to unlock it.</span>
                            <button
                              className="quest-role-profile-link"
                              onClick={(event) => {
                                event.stopPropagation()
                                navigateToPage('profile')
                              }}
                              type="button"
                            >
                              Go to profile
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <div className="quest-role-card-footer">
                        <span className="quest-role-count">{questCountLabel}</span>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>

            <div
              className={`quest-overview-bar ${isGithubConnected ? '' : 'is-builders-hidden'}`.trim()}
            >
              <div className="quest-overview-metric">
                <span className="quest-overview-label">Supporters</span>
                <span className="quest-overview-value">
                  {questProgressByRole.supporters.completedCount}/
                  {questProgressByRole.supporters.totalCount} completed
                </span>
                <span className="quest-overview-meta">
                  {questProgressByRole.supporters.earnedPoints} pts earned
                </span>
              </div>

              {isGithubConnected ? (
                <div className="quest-overview-metric">
                  <span className="quest-overview-label">Builders</span>
                  <span className="quest-overview-value">
                    {questProgressByRole.builders.completedCount}/
                    {questProgressByRole.builders.totalCount} completed
                  </span>
                  <span className="quest-overview-meta">
                    {questProgressByRole.builders.earnedPoints} pts earned
                  </span>
                </div>
              ) : null}

              <div className="quest-overview-metric is-total">
                <span className="quest-overview-label">Total</span>
                <span className="quest-overview-value">
                  {totalEarnedQuestPoints} pts
                </span>
                <span className="quest-overview-meta">earned across all roles</span>
              </div>
            </div>

            <div className="content-panel page-panel">
              <div className="quest-summary-row">
                <div className="quest-summary-copy">
                  <p className="section-eyebrow">Roadmap</p>
                  <h2 className="panel-title">
                    {QUEST_ROLE_LABELS[selectedQuestRole]} quests
                  </h2>
                  <p className="body-copy">
                    {getQuestRoleDescription(selectedQuestRole)}
                  </p>
                  {isSelectedQuestRoleLocked ? (
                    <div className="quest-role-lockout quest-role-lockout-inline">
                      <span>Connect your GitHub account from your profile to unlock progress tracking.</span>
                      <button
                        className="quest-role-profile-link"
                        onClick={() => {
                          navigateToPage('profile')
                        }}
                        type="button"
                      >
                        Go to profile
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {questLoadingMessage ? (
                <p className="body-copy quest-state-copy">{questLoadingMessage}</p>
              ) : quests.isError ? (
                <p className="body-copy quest-state-copy">{questErrorMessage}</p>
              ) : resolvedQuests.length === 0 ? (
                <p className="body-copy quest-state-copy">
                  No quests are available for this role yet.
                </p>
              ) : (
                <div className="quest-list">
                  {resolvedQuests.map((quest) => (
                    <article
                      className={`quest-card ${quest.isCompleted ? 'is-complete' : ''} ${isSelectedQuestRoleLocked ? 'is-locked' : ''}`}
                      key={`${selectedQuestRole}:${quest.id}`}
                    >
                      <div className="quest-card-meta">
                        <span className="quest-order">Quest {quest.id}</span>
                        <span className="quest-points-chip">{quest.points} pts</span>
                      </div>

                      <h3 className="quest-card-title">{quest.title}</h3>
                      <p className="quest-card-description">{quest.description}</p>

                      <div className="quest-card-footer">
                        <span
                          className={`quest-status-badge ${
                            isSelectedQuestRoleLocked
                              ? 'is-locked'
                              : quest.isCompleted
                                ? 'is-complete'
                                : 'is-pending'
                          }`}
                        >
                          {isSelectedQuestRoleLocked
                            ? 'Locked'
                            : quest.isCompleted
                              ? 'Completed'
                              : 'Pending'}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {currentPage === 'leaderboard' ? (
          <section className="content-panel page-panel">
            <p className="section-eyebrow">Leaderboard</p>
            <h1 className="page-title">A simple placeholder for the leaderboard page.</h1>
            <p className="body-copy">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
              eiusmod tempor incididunt ut labore et dolore magna aliqua. Tellus
              pellentesque eu tincidunt tortor aliquam nulla facilisi cras.
            </p>
          </section>
        ) : null}

        {currentPage === 'rules' ? (
          <section className="content-panel page-panel">
            <p className="section-eyebrow">Rules</p>
            <h1 className="page-title">A simple placeholder for the rules page.</h1>
            <p className="body-copy">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
              eiusmod tempor incididunt ut labore et dolore magna aliqua. Amet
              facilisis magna etiam tempor orci eu lobortis elementum nibh.
            </p>
          </section>
        ) : null}

        {currentPage === 'faq' ? (
          <section className="content-panel page-panel">
            <p className="section-eyebrow">FAQ</p>
            <h1 className="page-title">A simple placeholder for the FAQ page.</h1>
            <p className="body-copy">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
              eiusmod tempor incididunt ut labore et dolore magna aliqua. Amet
              justo donec enim diam vulputate ut pharetra sit amet aliquam.
            </p>
          </section>
        ) : null}

        {currentPage === 'profile' ? (
          <section className="profile-stack">
            <div className="content-panel page-panel">
              <p className="section-eyebrow">Profile</p>
              <div className="page-title-row">
                <h1 className="page-title">My profile</h1>
                {signedAddress ? (
                  <span className="address-chip">{signedAddress}</span>
                ) : null}
              </div>
              <p className="body-copy">
                Connect the rest of your identities here. This view now stays
                focused on account linking only.
              </p>
            </div>

            <div className="content-panel page-panel">
              <h2 className="panel-title">Connections</h2>
              <p className="body-copy">
                {profileRequiresSignIn
                  ? 'Use the login button in the navbar to connect your wallet and sign in before linking the rest of your accounts.'
                  : 'All linked accounts are managed from this page.'}
              </p>

              <div className="connection-list">
                {connectionRows.map((connection) => (
                  <article
                    className="connection-row"
                    key={connection.name}
                  >
                    <div className="connection-meta">
                      <p className="connection-name">{connection.name}</p>
                      <p className="connection-username">
                        {connection.isConnected
                          ? connection.username ?? 'Connected account'
                          : 'Not connected'}
                      </p>
                    </div>

                    <div className="connection-actions">
                      {connection.isConnected ? (
                        <button
                          aria-label={`Remove ${connection.name}`}
                          className="inline-danger-button"
                          disabled={!session.isAuthenticated || providerAction !== null}
                          onClick={connection.onClick}
                          type="button"
                        >
                          {providerAction === connection.variant ? 'Removing...' : 'Remove'}
                        </button>
                      ) : (
                        <button
                          className={`minimal-button ${connection.variant}-button`}
                          disabled={!session.isAuthenticated || providerAction !== null}
                          onClick={connection.onClick}
                          type="button"
                        >
                          {connection.statusLabel}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              {twitterProof ? (
                <div className="twitter-proof-shell">
                  <p className="twitter-proof-label">
                    Post this code on X, then paste the post URL below.
                  </p>
                  <p className="twitter-proof-code">{twitterProof.code}</p>
                  <p className="body-copy twitter-proof-meta">
                    Code expires at {twitterProof.expiresAt}
                  </p>
                  <label
                    className="twitter-proof-label"
                    htmlFor="twitter-proof-url"
                  >
                    Post URL
                  </label>
                  <input
                    className="twitter-proof-input"
                    id="twitter-proof-url"
                    onChange={(event) => {
                      setTwitterProof({
                        ...twitterProof,
                        tweetUrl: event.target.value,
                      })
                    }}
                    placeholder="https://x.com/your-handle/status/1234567890"
                    type="url"
                    value={twitterProof.tweetUrl}
                  />
                  <button
                    className="minimal-button twitter-verify-button"
                    disabled={!twitterProof.tweetUrl.trim() || providerAction !== null}
                    onClick={() => {
                      void handleTwitterVerify()
                    }}
                    type="button"
                  >
                    Verify post
                  </button>
                </div>
              ) : null}
            </div>

            {(wallet.isConnected || session.isAuthenticated) ? (
              <div className="content-panel page-panel session-panel">
                <h2 className="panel-title">Session</h2>
                <p className="body-copy">
                  Disconnecting here will also close the current signed session.
                </p>
                <div>
                  <button
                    className="minimal-button session-danger-button"
                    disabled={wallet.isConnecting || wallet.isSwitching || isSigningIn}
                    onClick={() => {
                      void handleWalletDisconnect()
                    }}
                    type="button"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  )
}

export default App
