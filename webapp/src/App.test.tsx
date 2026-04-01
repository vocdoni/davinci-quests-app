import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { AppConfig } from './config'
import type { LeaderboardRow } from './hooks/useLeaderboard'
import { useLeaderboard } from './hooks/useLeaderboard'
import { useQuests } from './hooks/useQuests'
import type { AppProfile } from './hooks/useAppSession'
import type { SequencerVerification } from './hooks/useAppSession'
import { useAppSession } from './hooks/useAppSession'
import { useWalletConnection } from './hooks/useWalletConnection'
import type { QuestCatalog } from './lib/quests'

vi.mock('./hooks/useWalletConnection', () => ({
  useWalletConnection: vi.fn(),
}))

vi.mock('./hooks/useAppSession', () => ({
  useAppSession: vi.fn(),
}))

vi.mock('./hooks/useQuests', () => ({
  useQuests: vi.fn(),
}))

vi.mock('./hooks/useLeaderboard', () => ({
  useLeaderboard: vi.fn(),
}))

const mockedUseWalletConnection = vi.mocked(useWalletConnection)
const mockedUseAppSession = vi.mocked(useAppSession)
const mockedUseLeaderboard = vi.mocked(useLeaderboard)
const mockedUseQuests = vi.mocked(useQuests)

type WalletConnectionState = ReturnType<typeof useWalletConnection>
type SessionState = ReturnType<typeof useAppSession>
type LeaderboardState = ReturnType<typeof useLeaderboard>
type QuestsState = ReturnType<typeof useQuests>

const baseConfig: AppConfig = {
  apiBaseUrl: 'https://api.example.org',
  targetChain: {
    blockExplorerUrl: 'https://explorer.example.org',
    id: 137,
    name: 'Polygon',
    nativeCurrency: {
      decimals: 18,
      name: 'MATIC',
      symbol: 'POL',
    },
    rpcUrl: 'https://rpc.example.org',
  },
  walletConnectProjectId: 'project-id',
}

function createWalletConnection(
  overrides: Record<string, unknown> = {},
): WalletConnectionState {
  return {
    activeConnectorName: null,
    address: undefined,
    chain: undefined,
    chainId: undefined,
    connectError: null,
    connectPrimaryWallet: vi.fn(),
    connectWallet: vi.fn(),
    connectors: [{ id: 'walletConnect', name: 'WalletConnect' }],
    disconnectWallet: vi.fn(),
    isConnected: false,
    isConnecting: false,
    isSigning: false,
    isSwitching: false,
    isWrongNetwork: false,
    primaryConnectorName: 'WalletConnect',
    requestSwitch: vi.fn(),
    signError: null,
    signMessage: vi.fn(async (): Promise<`0x${string}`> => '0xsigned'),
    switchError: null,
    targetChain: {
      name: 'Polygon',
    },
    ...overrides,
    } as unknown as WalletConnectionState
}

function createSequencerVerification(
  processId = '0x1234',
): { sequencer: SequencerVerification } {
  return {
    sequencer: {
      addressWeight: '1',
      error: null,
      hasVoted: false,
      isConnected: true,
      isInCensus: true,
      lastVerifiedAt: '2026-03-30T00:00:00.000Z',
      numOfProcessAsParticipant: 1,
      processId,
      processes: [
        {
          addressWeight: '1',
          error: null,
          hasVoted: false,
          isInCensus: true,
          lastVerifiedAt: '2026-03-30T00:00:00.000Z',
          processId,
          status: 'verified',
        },
      ],
      status: 'verified',
      votesCasted: 0,
    },
  }
}

function createProfile(
  overrides: Partial<
    Omit<AppProfile, 'identities' | 'onchain' | 'sequencer' | 'score' | 'stats' | 'wallet'>
  > & {
    identities?: Partial<AppProfile['identities']>
    onchain?: Partial<NonNullable<AppProfile['onchain']>>
    sequencer?: Partial<NonNullable<AppProfile['sequencer']>>
    score?: Partial<AppProfile['score']>
    wallet?: Partial<AppProfile['wallet']>
  } = {},
): AppProfile {
  const baseProfile = {
    identities: {
      discord: {
        connected: false,
        displayName: null,
        error: null,
        stats: {
          isInTargetServer: null,
        },
        status: 'disconnected',
        userId: null,
        username: null,
      },
      github: {
        connected: false,
        displayName: null,
        error: null,
        stats: {
          isFollowingTargetOrganization: null,
          isOlderThanOneYear: null,
          publicNonForkRepositoryCount: null,
          targetOrganization: 'vocdoni',
          targetRepositories: [
            {
              fullName: 'vocdoni/davinciNode',
              isStarred: null,
            },
            {
              fullName: 'vocdoni/davinciSDK',
              isStarred: null,
            },
          ],
        },
        status: 'disconnected',
        userId: null,
        username: null,
      },
      telegram: {
        connected: false,
        displayName: null,
        error: null,
        stats: {
          isInTargetChannel: null,
        },
        status: 'disconnected',
        userId: null,
        username: null,
      },
      twitter: {
        connected: false,
        displayName: null,
        error: null,
        stats: {},
        status: 'disconnected',
        userId: null,
        username: null,
      },
    },
    onchain: {
      error: null,
      isConnected: false,
      numberOfProcesses: 0,
      totalVotes: '0',
    },
    sequencer: {
      addressWeight: null,
      error: null,
      hasVoted: null,
      isConnected: false,
      isInCensus: null,
      lastVerifiedAt: null,
      processId: null,
      processes: [],
      numOfProcessAsParticipant: 0,
      status: 'unverified',
      votesCasted: 0,
    },
    score: {
      builderCompletedCount: 0,
      builderCompletedQuestIds: [],
      buildersPoints: 0,
      lastComputedAt: '2026-03-30T00:00:00.000Z',
      supporterCompletedCount: 0,
      supporterCompletedQuestIds: [],
      supportersPoints: 0,
      totalPoints: 0,
    },
    wallet: {
      address: '0x123400000000000000000000000000000000abcd',
      ensName: null,
    },
  } satisfies Omit<AppProfile, 'stats'>

  const mergedProfile = {
    ...baseProfile,
    ...overrides,
    identities: {
      ...baseProfile.identities,
      ...overrides.identities,
    },
    onchain: {
      ...baseProfile.onchain,
      ...overrides.onchain,
    },
    sequencer: {
      ...baseProfile.sequencer,
      ...overrides.sequencer,
    },
    wallet: {
      ...baseProfile.wallet,
      ...overrides.wallet,
    },
  }
  const sequencerProcesses = Array.isArray(mergedProfile.sequencer.processes)
    ? mergedProfile.sequencer.processes
    : []

  const inferredSupporterCompletedQuestIds =
    mergedProfile.identities.discord.stats.isInTargetServer ? [1] : []
  const inferredBuilderCompletedQuestIds =
    mergedProfile.identities.github.stats.targetRepositories
      .map((repository, index) => (repository.isStarred ? index + 1 : null))
      .filter((value): value is number => value !== null)
  const inferredBuildersPoints =
    (inferredBuilderCompletedQuestIds.includes(1) ? 320 : 0) +
    (inferredBuilderCompletedQuestIds.includes(2) ? 420 : 0)
  const inferredSupportersPoints = inferredSupporterCompletedQuestIds.includes(1) ? 100 : 0
  const score = {
    ...baseProfile.score,
    builderCompletedCount: inferredBuilderCompletedQuestIds.length,
    builderCompletedQuestIds: inferredBuilderCompletedQuestIds,
    buildersPoints: inferredBuildersPoints,
    supporterCompletedCount: inferredSupporterCompletedQuestIds.length,
    supporterCompletedQuestIds: inferredSupporterCompletedQuestIds,
    supportersPoints: inferredSupportersPoints,
    totalPoints: inferredBuildersPoints + inferredSupportersPoints,
    ...overrides.score,
  }
  const stats = {
    discord: {
      isInTargetServer: mergedProfile.identities.discord.stats.isInTargetServer,
      messagesInTargetChannel:
        (
          mergedProfile.identities.discord.stats as {
            isInTargetServer: boolean | null
            messagesInTargetChannel?: number | null
          }
        ).messagesInTargetChannel ?? null,
    },
    github: {
      isFollowingTargetOrganization:
        mergedProfile.identities.github.stats.isFollowingTargetOrganization,
      isOlderThanOneYear: mergedProfile.identities.github.stats.isOlderThanOneYear,
      publicNonForkRepositoryCount:
        mergedProfile.identities.github.stats.publicNonForkRepositoryCount,
      targetOrganization: mergedProfile.identities.github.stats.targetOrganization,
      targetRepositories: mergedProfile.identities.github.stats.targetRepositories,
    },
    onchain: {
      address: mergedProfile.wallet.address,
      error: mergedProfile.onchain?.error ?? null,
      isConnected: mergedProfile.onchain?.isConnected ?? false,
      numberOfProcesses: mergedProfile.onchain?.numberOfProcesses ?? 0,
      totalVotes: mergedProfile.onchain?.totalVotes ?? '0',
    },
    quests: {
      builders: {
        completed: score.builderCompletedCount,
        points: score.buildersPoints,
        total: 2,
      },
      supporters: {
        completed: score.supporterCompletedCount,
        points: score.supportersPoints,
        total: 2,
      },
    },
    sequencer: {
      lastVerifiedAt: mergedProfile.sequencer.lastVerifiedAt,
      numOfProcessAsParticipant: mergedProfile.sequencer.numOfProcessAsParticipant,
      processes: sequencerProcesses
        .map((process) => process.processId)
        .filter((processId): processId is string => typeof processId === 'string'),
      votesCasted: mergedProfile.sequencer.votesCasted,
    },
    telegram: {
      isInTargetChannel: mergedProfile.identities.telegram.stats.isInTargetChannel,
    },
    twitter: {},
  }

  return {
    ...mergedProfile,
    stats,
    score,
  }
}

function createSession(overrides: Record<string, unknown> = {}): SessionState {
  return {
    clearLinkFeedback: vi.fn(),
    error: null,
    isAuthenticated: false,
    isLoading: false,
    isReady: true,
    linkFeedback: null,
    logout: vi.fn(async () => undefined),
    profile: null,
    refetchProfile: vi.fn(),
    requestTwitterCode: vi.fn(async () => ({
      code: 'twitter-proof-code',
      expiresAt: '2026-03-25T12:00:00.000Z',
    })),
    requestWalletChallenge: vi.fn(async () => ({ message: 'Sign this challenge' })),
    sessionWalletAddress: null,
    startProviderConnection: vi.fn(),
    unlinkProvider: vi.fn(async () => undefined),
    verifySequencerProcess: vi.fn(async (processId: string) =>
      createSequencerVerification(processId),
    ),
    verifyTwitterTweet: vi.fn(async () => undefined),
    verifyWallet: vi.fn(async () => undefined),
    ...overrides,
  } as SessionState
}

function createQuestCatalog(
  overrides: Partial<QuestCatalog> = {},
): QuestCatalog {
  return {
    builders: [
      {
        achievement: 'github.targetRepositories[0].isStarred == true',
        description: 'Builder quest description',
        id: 1,
        points: 320,
        title: 'Star the Davinci Node repo on GitHub',
      },
      {
        achievement: 'github.targetRepositories[1].isStarred == true',
        description: 'Second builder quest description',
        id: 2,
        points: 420,
        title: 'Star the Davinci SDK repo on GitHub',
      },
    ],
    supporters: [
      {
        achievement: 'discord.isInTargetServer == true',
        description: 'Supporter quest description',
        callToAction: {
          help: 'Open the Discord invite if you still need to join.',
          title: 'Join Discord',
          url: 'https://example.org/discord',
        },
        connectButton: {
          title: 'Connect Discord',
          url: '/profile',
        },
        id: 1,
        points: 100,
        title: 'Join the Vocdoni Discord server',
      },
    ],
    ...overrides,
  }
}

function createQuestsState(overrides: Record<string, unknown> = {}): QuestsState {
  return {
    data: createQuestCatalog(),
    error: null,
    isError: false,
    isFetched: true,
    isFetching: false,
    isLoading: false,
    isPending: false,
    isSuccess: true,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as QuestsState
}

function createLeaderboardState(
  overrides: Record<string, unknown> = {},
): LeaderboardState {
  return {
    data: {
      rows: [],
    },
    error: null,
    isError: false,
    isFetched: true,
    isFetching: false,
    isLoading: false,
    isPending: false,
    isSuccess: true,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as LeaderboardState
}

beforeEach(() => {
  mockedUseWalletConnection.mockReset()
  mockedUseAppSession.mockReset()
  mockedUseLeaderboard.mockReset()
  mockedUseQuests.mockReset()
  mockedUseLeaderboard.mockReturnValue(createLeaderboardState())
  mockedUseQuests.mockReturnValue(createQuestsState())
  window.history.replaceState(null, '', '/')
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('App', () => {
  it('uses the navbar login button to connect first and then finish wallet sign-in', async () => {
    const user = userEvent.setup()
    const connectPrimaryWallet = vi.fn(async () => undefined)
    const signMessage = vi.fn(async (): Promise<`0x${string}`> => '0xsigned')
    const requestWalletChallenge = vi.fn(async () => ({
      message: 'Sign this challenge',
    }))
    const verifyWallet = vi.fn(async () => undefined)

    const walletState = createWalletConnection({
      connectPrimaryWallet,
    })
    const sessionState = createSession({
      requestWalletChallenge,
      verifyWallet,
    })

    mockedUseWalletConnection.mockImplementation(() => walletState)
    mockedUseAppSession.mockImplementation(() => sessionState)

    const { rerender } = render(<App config={baseConfig} />)

    await user.click(screen.getByRole('button', { name: 'Login' }))

    expect(connectPrimaryWallet).toHaveBeenCalledTimes(1)

    walletState.address = '0x123400000000000000000000000000000000abcd'
    walletState.connectors = []
    walletState.isConnected = true
    walletState.signMessage = signMessage

    rerender(<App config={baseConfig} />)

    await waitFor(() => {
      expect(requestWalletChallenge).toHaveBeenCalledWith(
        '0x123400000000000000000000000000000000abcd',
      )
      expect(signMessage).toHaveBeenCalledWith('Sign this challenge')
      expect(verifyWallet).toHaveBeenCalledWith(
        '0x123400000000000000000000000000000000abcd',
        '0xsigned',
      )
    })
  })

  it('toggles the mobile navigation menu button state', async () => {
    mockedUseWalletConnection.mockReturnValue(createWalletConnection())
    mockedUseAppSession.mockReturnValue(createSession())

    const { container } = render(<App config={baseConfig} />)
    const mobileMenuToggle = container.querySelector('.navbar-menu-toggle')

    expect(mobileMenuToggle).not.toBeNull()

    expect(mobileMenuToggle).toHaveAttribute('aria-expanded', 'false')
    expect(mobileMenuToggle).toHaveAttribute('aria-label', 'Open navigation menu')

    fireEvent.click(mobileMenuToggle!)

    expect(mobileMenuToggle).toHaveAttribute('aria-expanded', 'true')
    expect(mobileMenuToggle).toHaveAttribute('aria-label', 'Close navigation menu')

    fireEvent.click(mobileMenuToggle!)

    expect(mobileMenuToggle).toHaveAttribute('aria-expanded', 'false')
    expect(mobileMenuToggle).toHaveAttribute('aria-label', 'Open navigation menu')
  })

  it('keeps the server session data available when the wallet is disconnected on reload', () => {
    const logout = vi.fn(async () => undefined)

    mockedUseWalletConnection.mockReturnValue(createWalletConnection())
    mockedUseAppSession.mockReturnValue(
      createSession({
        isAuthenticated: false,
        logout,
        profile: createProfile({
          identities: {
            discord: {
              connected: true,
              displayName: 'Quest Master',
              error: null,
              stats: {
                isInTargetServer: true,
              },
              status: 'active',
              userId: '111111111111111111',
              username: 'questmaster',
            },
          },
          score: {
            builderCompletedCount: 0,
            builderCompletedQuestIds: [],
            buildersPoints: 0,
            supporterCompletedCount: 0,
            supporterCompletedQuestIds: [],
            supportersPoints: 0,
            totalPoints: 0,
          },
        }),
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
      }),
    )

    render(<App config={baseConfig} />)

    expect(logout).not.toHaveBeenCalled()
    expect(
      screen.getByRole('heading', { name: 'Join the Vocdoni Discord server' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Discord' })).toBeInTheDocument()
  })

  it('shows the trimmed address in the navbar and routes to the profile page on click', async () => {
    const user = userEvent.setup()

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(
      createSession({
        isAuthenticated: true,
        profile: createProfile(),
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
      }),
    )

    render(<App config={baseConfig} />)

    const profileButton = screen.getByRole('button', { name: '0x1234...abcd' })
    await user.hover(profileButton)

    await user.click(screen.getByRole('button', { name: 'Go to my profile' }))

    expect(screen.getByRole('heading', { name: 'My profile' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/profile')
  })

  it('capitalizes the provider name in the link banner and auto-dismisses it after 5 seconds', () => {
    vi.useFakeTimers()

    const clearLinkFeedback = vi.fn()

    mockedUseWalletConnection.mockReturnValue(createWalletConnection())
    mockedUseAppSession.mockReturnValue(
      createSession({
        clearLinkFeedback,
        linkFeedback: {
          error: null,
          provider: 'github',
          status: 'success',
        },
      }),
    )

    render(<App config={baseConfig} />)

    expect(screen.getByText('GitHub linked successfully.')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(clearLinkFeedback).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('uses quests as the root page and shows supporter quests by default', async () => {
    const user = userEvent.setup()

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(createSession())

    render(<App config={baseConfig} />)

    expect(
      screen.getByRole('heading', { name: 'Shape the future of onchain decisions.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Supporters/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: /Builders/ })).toHaveAttribute(
      'aria-selected',
      'false',
    )
    expect(
      screen.queryByRole('heading', { name: 'Star the Davinci Node repo on GitHub' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Join the Vocdoni Discord server' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Click change to this track')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Join Discord/ })).not.toBeDisabled()
    expect(
      screen.getByText('Open the Discord invite if you still need to join.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'About' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Quests' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Leaderboard' })).toHaveAttribute(
      'href',
      '/leaderboard',
    )
    expect(screen.getByRole('link', { name: 'Rules' })).toHaveAttribute('href', '/rules')
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/faq')
    expect(
      screen.getByRole('button', { name: 'Connect Discord' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Connect GitHub' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Connect Discord' }))

    expect(screen.getByRole('heading', { name: 'My profile' })).toBeInTheDocument()
  })

  it('shows the custom connect button until the quest is completed', async () => {
    const user = userEvent.setup()

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(
      createSession({
        isAuthenticated: true,
        profile: createProfile({
          identities: {
            discord: {
              connected: true,
              displayName: 'Quest Master',
              error: null,
              stats: {
                isInTargetServer: true,
              },
              status: 'active',
              userId: '111111111111111111',
              username: 'questmaster',
            },
          },
          score: {
            builderCompletedCount: 0,
            builderCompletedQuestIds: [],
            buildersPoints: 0,
            supporterCompletedCount: 0,
            supporterCompletedQuestIds: [],
            supportersPoints: 0,
            totalPoints: 0,
          },
        }),
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
      }),
    )
    mockedUseQuests.mockReturnValue(
      createQuestsState({
        data: createQuestCatalog({
          supporters: [
            {
              achievement: 'quests.supporters.completed >= 1',
              description: 'Supporter quest description',
              connectButton: {
                title: 'Open profile',
                url: '/profile/sequencer',
              },
              id: 1,
              points: 100,
              title: 'Join the Vocdoni Discord server',
            },
          ],
        }),
      }),
    )

    render(<App config={baseConfig} />)

    expect(screen.getByRole('button', { name: 'Open profile' })).toBeInTheDocument()
    expect(screen.getByText('1 more to complete')).toBeInTheDocument()
    expect(screen.getByText('1 required')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Connect Discord' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open profile' }))

    expect(
      screen.getByRole('heading', { name: 'Verify a process against your wallet.' }),
    ).toBeInTheDocument()
  })

  it('routes sequencer quests to the hidden verifier page when the source is not connected', async () => {
    const user = userEvent.setup()

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(
      createSession({
        isAuthenticated: true,
        profile: createProfile({
          sequencer: {
            addressWeight: null,
            error: null,
            hasVoted: null,
            isConnected: false,
            isInCensus: null,
            lastVerifiedAt: null,
            processId: null,
            processes: [],
            numOfProcessAsParticipant: 0,
            status: 'unverified',
            votesCasted: 0,
          },
        }),
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
      }),
    )
    mockedUseQuests.mockReturnValue(
      createQuestsState({
        data: createQuestCatalog({
          supporters: [
            {
              achievement: 'sequencer.hasVoted == true',
              connectButton: {
                title: 'Verify process',
                url: '/profile/sequencer',
              },
              description: 'Supporter quest description',
              id: 1,
              points: 100,
              title: 'Verify a sequencer process',
            },
          ],
        }),
      }),
    )

    render(<App config={baseConfig} />)

    expect(screen.getByRole('button', { name: 'Verify process' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Verify process' }))

    expect(
      screen.getByRole('heading', { name: 'Verify a process against your wallet.' }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/profile/sequencer')
  })

  it('accepts a process link and extracts the process id before verification', async () => {
    window.history.replaceState(null, '', '/profile/sequencer')

    const user = userEvent.setup()
    const processId = `0x${'1'.repeat(62)}`
    const verifySequencerProcess = vi.fn(async (nextProcessId: string) =>
      createSequencerVerification(nextProcessId),
    )

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(
      createSession({
        isAuthenticated: true,
        profile: createProfile(),
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
        verifySequencerProcess,
      }),
    )

    render(<App config={baseConfig} />)

    const processInput = screen.getByLabelText('Process id or link')

    await user.clear(processInput)
    await user.type(
      processInput,
      `https://explorer.example.org/processes/${processId}?tab=results`,
    )
    await user.click(screen.getByRole('button', { name: 'Verify process' }))

    await waitFor(() => {
      expect(verifySequencerProcess).toHaveBeenCalledWith(processId)
    })
    expect(screen.getByDisplayValue(processId)).toBeInTheDocument()
  })

  it('shows a validation error when the sequencer input does not contain a valid process id', async () => {
    window.history.replaceState(null, '', '/profile/sequencer')

    const user = userEvent.setup()
    const verifySequencerProcess = vi.fn(async (nextProcessId: string) =>
      createSequencerVerification(nextProcessId),
    )

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(
      createSession({
        isAuthenticated: true,
        profile: createProfile(),
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
        verifySequencerProcess,
      }),
    )

    render(<App config={baseConfig} />)

    const processInput = screen.getByLabelText('Process id or link')

    await user.clear(processInput)
    await user.type(processInput, 'https://explorer.example.org/processes/not-a-process-id')
    await user.click(screen.getByRole('button', { name: 'Verify process' }))

    expect(verifySequencerProcess).not.toHaveBeenCalled()
    expect(
      screen.getByText('Enter a valid process id or a link containing one.'),
    ).toBeInTheDocument()
  })

  it('keeps the connect button visible until the quest is completed', () => {
    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(
      createSession({
        isAuthenticated: true,
        profile: createProfile({
          identities: {
            discord: {
              connected: true,
              displayName: 'Quest Master',
              error: null,
              stats: {
                isInTargetServer: false,
              },
              status: 'active',
              userId: '111111111111111111',
              username: 'questmaster',
            },
          },
        }),
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
      }),
    )

    render(<App config={baseConfig} />)

    expect(screen.getByRole('button', { name: /Join Discord/ })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Connect Discord' })).toBeInTheDocument()
  })

  it('keeps the main quest CTA enabled even when its source is not connected', () => {
    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(
      createSession({
        isAuthenticated: true,
        profile: createProfile({
          sequencer: {
            addressWeight: null,
            error: null,
            hasVoted: null,
            isConnected: false,
            isInCensus: null,
            lastVerifiedAt: null,
            processId: null,
            processes: [],
            numOfProcessAsParticipant: 0,
            status: 'unverified',
            votesCasted: 0,
          },
        }),
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
      }),
    )
    mockedUseQuests.mockReturnValue(
      createQuestsState({
        data: createQuestCatalog({
          supporters: [
            {
              achievement: 'sequencer.hasVoted == true',
              callToAction: {
                help: 'Verify your vote after participating.',
                title: 'Verify vote',
                url: '/profile/sequencer',
              },
              description: 'Supporter quest description',
              id: 1,
              points: 100,
              title: 'Verify a sequencer vote',
            },
          ],
        }),
      }),
    )

    render(<App config={baseConfig} />)

    expect(screen.getByRole('button', { name: 'Verify vote' })).not.toBeDisabled()
  })

  it('hides the quest call to action once the quest is completed', async () => {
    const user = userEvent.setup()

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(
      createSession({
        isAuthenticated: true,
        profile: createProfile({
          identities: {
            discord: {
              connected: true,
              displayName: 'Quest Master',
              error: null,
              stats: {
                isInTargetServer: true,
                messagesInTargetChannel: 3,
              },
              status: 'active',
              userId: '111111',
              username: 'questmaster',
            },
          },
        }),
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
      }),
    )

    render(<App config={baseConfig} />)

    await user.click(screen.getByRole('tab', { name: /Supporters/ }))

    expect(screen.getByRole('heading', { name: 'Join the Vocdoni Discord server' })).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Join Discord/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect Discord' })).not.toBeInTheDocument()
  })

  it('lets users preview builder quests before GitHub is connected', async () => {
    const user = userEvent.setup()

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(createSession())

    render(<App config={baseConfig} />)

    await user.click(screen.getByRole('tab', { name: /Builders/ }))

    expect(screen.getByRole('tab', { name: /Builders/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(
      screen.getByRole('heading', { name: 'Star the Davinci Node repo on GitHub' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Locked').length).toBeGreaterThan(0)
    expect(
      screen.getByText('Connect your GitHub account from your profile to unlock progress tracking.'),
    ).toBeInTheDocument()
  })

  it('renders leaderboard rows from the backend snapshot', async () => {
    mockedUseWalletConnection.mockReturnValue(createWalletConnection())
    mockedUseAppSession.mockReturnValue(createSession())
    mockedUseLeaderboard.mockReturnValue(
      createLeaderboardState({
        data: {
          rows: [
            {
              buildersPoints: 320,
              displayName: 'alice.eth',
              ensName: 'alice.eth',
              lastComputedAt: '2026-03-30T09:00:00.000Z',
              rank: 1,
              supportersPoints: 100,
              totalPoints: 420,
              walletAddress: '0x123400000000000000000000000000000000abcd',
            } satisfies LeaderboardRow,
          ],
        },
      }),
    )
    window.history.replaceState(null, '', '/leaderboard')

    render(<App config={baseConfig} />)

    expect(
      screen.getByRole('heading', { name: 'See who is leading the quests.' }),
    ).toBeInTheDocument()
    expect(screen.getByText('alice.eth')).toBeInTheDocument()
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('420 pts')).toBeInTheDocument()
  })

  it('shows a cross-role quest summary bar with supporter, builder, and total points', () => {
    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(
      createSession({
        isAuthenticated: true,
        profile: createProfile({
          identities: {
            discord: {
              connected: true,
              displayName: 'Quest Master',
              error: null,
              stats: {
                isInTargetServer: true,
              },
              status: 'active',
              userId: '111111111111111111',
              username: 'questmaster',
            },
            github: {
              connected: true,
              displayName: 'Quest Coder',
              error: null,
              stats: {
                isFollowingTargetOrganization: true,
                isOlderThanOneYear: true,
                publicNonForkRepositoryCount: 12,
                targetOrganization: 'vocdoni',
                targetRepositories: [
                  {
                    fullName: 'vocdoni/davinciNode',
                    isStarred: true,
                  },
                  {
                    fullName: 'vocdoni/davinciSDK',
                    isStarred: false,
                  },
                ],
              },
              status: 'active',
              userId: '333333',
              username: 'questcoder',
            },
          },
        }),
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
      }),
    )

    render(<App config={baseConfig} />)

    expect(
      screen.getByText('Supporters', { selector: '.quest-overview-label' }),
    ).toBeInTheDocument()
    expect(screen.getByText('1/1 completed')).toBeInTheDocument()
    expect(screen.getByText('100 pts earned')).toBeInTheDocument()
    expect(
      screen.getByText('Builders', { selector: '.quest-overview-label' }),
    ).toBeInTheDocument()
    expect(screen.getByText('1/2 completed')).toBeInTheDocument()
    expect(screen.getByText('320 pts earned')).toBeInTheDocument()
    expect(
      screen.getByText('Total', { selector: '.quest-overview-label' }),
    ).toBeInTheDocument()
    expect(screen.getByText('420 pts')).toBeInTheDocument()
  })

  it('hides the builders summary metric until GitHub is connected', () => {
    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(
      createSession({
        isAuthenticated: true,
        profile: createProfile({
          identities: {
            discord: {
              connected: true,
              displayName: 'Quest Supporter',
              error: null,
              stats: {
                isInTargetServer: true,
              },
              status: 'active',
              userId: '222222',
              username: 'questsupporter',
            },
          },
        }),
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
      }),
    )

    render(<App config={baseConfig} />)

    expect(
      screen.getByText('Supporters', { selector: '.quest-overview-label' }),
    ).toBeInTheDocument()
    expect(screen.getByText('1/1 completed')).toBeInTheDocument()
    expect(screen.getByText('100 pts earned')).toBeInTheDocument()
    expect(
      screen.queryByText('Builders', { selector: '.quest-overview-label' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('Total', { selector: '.quest-overview-label' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('100 pts', { selector: '.quest-overview-value' }),
    ).toBeInTheDocument()
  })

  it('offers a profile shortcut from the locked builder card', async () => {
    const user = userEvent.setup()

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(createSession())

    render(<App config={baseConfig} />)

    await user.click(screen.getByRole('button', { name: 'Go to profile' }))

    expect(screen.getByRole('heading', { name: 'My profile' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/profile')
  })

  it('unlocks builder quests when GitHub is connected', async () => {
    const user = userEvent.setup()

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(
      createSession({
        isAuthenticated: true,
        profile: createProfile({
          identities: {
            github: {
              connected: true,
              displayName: 'Quest Coder',
              error: null,
              stats: {
                isFollowingTargetOrganization: true,
                isOlderThanOneYear: true,
                publicNonForkRepositoryCount: 12,
                targetOrganization: 'vocdoni',
                targetRepositories: [
                  {
                    fullName: 'vocdoni/davinciNode',
                    isStarred: true,
                  },
                  {
                    fullName: 'vocdoni/davinciSDK',
                    isStarred: false,
                  },
                ],
              },
              status: 'active',
              userId: '333333',
              username: 'questcoder',
            },
          },
        }),
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
      }),
    )

    render(<App config={baseConfig} />)

    const buildersButton = screen.getByRole('tab', { name: /Builders/ })
    expect(buildersButton).toBeEnabled()

    await user.click(buildersButton)

    expect(buildersButton).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByRole('heading', { name: 'Star the Davinci Node repo on GitHub' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('shows provider buttons on the profile page and keeps them disabled until the wallet session is authenticated', () => {
    window.history.replaceState(null, '', '/profile')

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(createSession())

    render(<App config={baseConfig} />)

    expect(screen.getByRole('button', { name: 'Connect Discord' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Connect GitHub' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Connect Telegram' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Connect X' })).toBeDisabled()
  })

  it('shows a sequencer verification shortcut on the profile page', async () => {
    window.history.replaceState(null, '', '/profile')

    const user = userEvent.setup()

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(
      createSession({
        isAuthenticated: true,
        profile: createProfile({
          sequencer: {
            addressWeight: '3',
            error: null,
            hasVoted: false,
            isConnected: true,
            isInCensus: true,
            lastVerifiedAt: '2026-03-24T18:00:00.000Z',
            processId: `0x${'1'.repeat(62)}`,
            processes: [
              {
                addressWeight: '3',
                error: null,
                hasVoted: false,
                isInCensus: true,
                lastVerifiedAt: '2026-03-24T18:00:00.000Z',
                processId: `0x${'1'.repeat(62)}`,
                status: 'verified',
              },
            ],
            numOfProcessAsParticipant: 1,
            status: 'verified',
            votesCasted: 0,
          },
        }),
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
      }),
    )

    render(<App config={baseConfig} />)

    expect(screen.getByRole('button', { name: 'Verify process' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Verify process' }))

    expect(
      screen.getByRole('heading', { name: 'Verify a process against your wallet.' }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/profile/sequencer')
  })

  it('locks an OAuth connect button into a connecting state after click', async () => {
    window.history.replaceState(null, '', '/profile')

    const user = userEvent.setup()
    const startProviderConnection = vi.fn()

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(
      createSession({
        isAuthenticated: true,
        profile: createProfile(),
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
        startProviderConnection,
      }),
    )

    render(<App config={baseConfig} />)

    await user.click(screen.getByRole('button', { name: 'Connect Discord' }))

    expect(startProviderConnection).toHaveBeenCalledWith('discord')
    expect(screen.getByRole('button', { name: 'Connecting...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Connect GitHub' })).toBeDisabled()
  })

  it('renders the simplified profile connections with the signed address chip', () => {
    window.history.replaceState(null, '', '/profile')

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(
      createSession({
        isAuthenticated: true,
        profile: createProfile({
          identities: {
            discord: {
              connected: true,
              displayName: 'Quest Master',
              error: null,
              stats: {
                isInTargetServer: true,
              },
              status: 'active',
              userId: '111111111111111111',
              username: 'questmaster',
            },
            github: {
              connected: true,
              displayName: 'Quest Coder',
              error: null,
              stats: {
                isFollowingTargetOrganization: true,
                isOlderThanOneYear: true,
                publicNonForkRepositoryCount: 12,
                targetOrganization: 'vocdoni',
                targetRepositories: [
                  {
                    fullName: 'vocdoni/davinciNode',
                    isStarred: true,
                  },
                  {
                    fullName: 'vocdoni/davinciSDK',
                    isStarred: false,
                  },
                ],
              },
              status: 'active',
              userId: '333333',
              username: 'questcoder',
            },
            telegram: {
              connected: true,
              displayName: 'Quest Captain',
              error: null,
              stats: {
                isInTargetChannel: true,
              },
              status: 'active',
              userId: '222222222',
              username: 'questcaptain',
            },
            twitter: {
              connected: true,
              displayName: 'Quest Poster',
              error: null,
              stats: {},
              status: 'active',
              userId: 'questtweeter',
              username: 'questtweeter',
            },
          },
          onchain: {
            error: null,
            numberOfProcesses: 2,
            totalVotes: '33',
          },
        }),
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
      }),
    )

    render(<App config={baseConfig} />)

    expect(
      screen.getByText('0x123400000000000000000000000000000000abcd', {
        selector: '.address-chip',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('questmaster')).toBeInTheDocument()
    expect(screen.getByText('questcoder')).toBeInTheDocument()
    expect(screen.getByText('questcaptain')).toBeInTheDocument()
    expect(screen.getByText('questtweeter')).toBeInTheDocument()
    expect(screen.queryByText('Public repos (non-fork): 12')).not.toBeInTheDocument()
    expect(screen.queryByText('Total votes: 33')).not.toBeInTheDocument()
  })

  it('unlinks connected providers and disconnects the wallet from the profile page', async () => {
    window.history.replaceState(null, '', '/profile')

    const user = userEvent.setup()
    const disconnectWallet = vi.fn()
    const logout = vi.fn(async () => undefined)
    const unlinkProvider = vi.fn(async () => undefined)

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        disconnectWallet,
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(
      createSession({
        isAuthenticated: true,
        logout,
        profile: createProfile({
          identities: {
            discord: {
              connected: true,
              displayName: 'Quest Master',
              error: null,
              stats: {
                isInTargetServer: true,
              },
              status: 'active',
              userId: '111111111111111111',
              username: 'questmaster',
            },
            github: {
              connected: true,
              displayName: 'Quest Coder',
              error: null,
              stats: {
                isFollowingTargetOrganization: true,
                isOlderThanOneYear: true,
                publicNonForkRepositoryCount: 12,
                targetOrganization: 'vocdoni',
                targetRepositories: [
                  {
                    fullName: 'vocdoni/davinciNode',
                    isStarred: true,
                  },
                  {
                    fullName: 'vocdoni/davinciSDK',
                    isStarred: false,
                  },
                ],
              },
              status: 'active',
              userId: '333333',
              username: 'questcoder',
            },
            telegram: {
              connected: true,
              displayName: 'Quest Captain',
              error: null,
              stats: {
                isInTargetChannel: true,
              },
              status: 'active',
              userId: '222222222',
              username: 'questcaptain',
            },
            twitter: {
              connected: true,
              displayName: 'Quest Poster',
              error: null,
              stats: {},
              status: 'active',
              userId: 'questtweeter',
              username: 'questtweeter',
            },
          },
        }),
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
        unlinkProvider,
      }),
    )

    render(<App config={baseConfig} />)

    await user.click(screen.getByRole('button', { name: 'Remove Discord' }))
    await waitFor(() => {
      expect(unlinkProvider).toHaveBeenCalledWith('discord')
    })

    await user.click(screen.getByRole('button', { name: 'Remove GitHub' }))
    await waitFor(() => {
      expect(unlinkProvider).toHaveBeenCalledWith('github')
    })

    await user.click(screen.getByRole('button', { name: 'Remove Telegram' }))
    await waitFor(() => {
      expect(unlinkProvider).toHaveBeenCalledWith('telegram')
    })

    await user.click(screen.getByRole('button', { name: 'Remove X' }))
    await waitFor(() => {
      expect(unlinkProvider).toHaveBeenCalledWith('twitter')
    })

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1)
      expect(disconnectWallet).toHaveBeenCalledTimes(1)
    })
  })

  it('requests an X proof code and verifies the post URL inline from the profile page', async () => {
    window.history.replaceState(null, '', '/profile')

    const user = userEvent.setup()
    const requestTwitterCode = vi.fn(async () => ({
      code: 'twitter-proof-code',
      expiresAt: '2026-03-25T12:00:00.000Z',
    }))
    const verifyTwitterTweet = vi.fn(async () => undefined)

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseAppSession.mockReturnValue(
      createSession({
        isAuthenticated: true,
        profile: createProfile(),
        requestTwitterCode,
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
        verifyTwitterTweet,
      }),
    )

    render(<App config={baseConfig} />)

    await user.click(screen.getByRole('button', { name: 'Connect X' }))

    await waitFor(() => {
      expect(requestTwitterCode).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText('twitter-proof-code')).toBeInTheDocument()

    await user.type(
      screen.getByLabelText('Post URL'),
      'https://x.com/questtweeter/status/1234567890',
    )
    await user.click(screen.getByRole('button', { name: 'Verify post' }))

    await waitFor(() => {
      expect(verifyTwitterTweet).toHaveBeenCalledWith(
        'https://x.com/questtweeter/status/1234567890',
      )
    })
  })
})
