import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { AppConfig } from './config'
import { useQuests } from './hooks/useQuests'
import type { AppProfile } from './hooks/useAppSession'
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

const mockedUseWalletConnection = vi.mocked(useWalletConnection)
const mockedUseAppSession = vi.mocked(useAppSession)
const mockedUseQuests = vi.mocked(useQuests)

type WalletConnectionState = ReturnType<typeof useWalletConnection>
type SessionState = ReturnType<typeof useAppSession>
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

function createProfile(
  overrides: Partial<Omit<AppProfile, 'identities' | 'onchain' | 'wallet'>> & {
    identities?: Partial<AppProfile['identities']>
    onchain?: Partial<AppProfile['onchain']>
    wallet?: Partial<AppProfile['wallet']>
  } = {},
): AppProfile {
  const baseProfile: AppProfile = {
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
      numberOfProcesses: 0,
      totalVotes: '0',
    },
    wallet: {
      address: '0x123400000000000000000000000000000000abcd',
    },
  }

  return {
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
    wallet: {
      ...baseProfile.wallet,
      ...overrides.wallet,
    },
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

beforeEach(() => {
  mockedUseWalletConnection.mockReset()
  mockedUseAppSession.mockReset()
  mockedUseQuests.mockReset()
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
        }),
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
      }),
    )

    render(<App config={baseConfig} />)

    expect(logout).not.toHaveBeenCalled()
    expect(
      screen.getByRole('heading', { name: 'Join the Vocdoni Discord server' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
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

  it('uses quests as the root page and shows supporter quests by default', () => {
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
      screen.getByRole('heading', { name: 'Complete quests and earn points.' }),
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
      screen.queryByRole('button', { name: 'Connect Discord' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Connect GitHub' }),
    ).not.toBeInTheDocument()
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
