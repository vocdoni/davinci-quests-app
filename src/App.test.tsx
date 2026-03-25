import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { AppConfig } from './config'
import { useAppSession } from './hooks/useAppSession'
import { useWalletConnection } from './hooks/useWalletConnection'

vi.mock('./hooks/useWalletConnection', () => ({
  useWalletConnection: vi.fn(),
}))

vi.mock('./hooks/useAppSession', () => ({
  useAppSession: vi.fn(),
}))

const mockedUseWalletConnection = vi.mocked(useWalletConnection)
const mockedUseAppSession = vi.mocked(useAppSession)

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

function createWalletConnection(overrides: Record<string, unknown> = {}) {
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
    signMessage: vi.fn(async () => '0xsigned'),
    switchError: null,
    targetChain: {
      name: 'Polygon',
    },
    ...overrides,
  } as never
}

function createSession(overrides: Record<string, unknown> = {}) {
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
  } as never
}

beforeEach(() => {
  mockedUseWalletConnection.mockReset()
  mockedUseAppSession.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('App', () => {
  it('connects the wallet when no wallet is connected', async () => {
    const user = userEvent.setup()
    const connectPrimaryWallet = vi.fn()

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({ connectPrimaryWallet }),
    )
    mockedUseAppSession.mockReturnValue(createSession())

    render(<App config={baseConfig} />)

    await user.click(screen.getByRole('button', { name: 'Connect wallet' }))

    expect(connectPrimaryWallet).toHaveBeenCalledTimes(1)
  })

  it('signs in with the connected wallet before loading provider actions', async () => {
    const user = userEvent.setup()
    const signMessage = vi.fn(async () => '0xsigned')
    const requestWalletChallenge = vi.fn(async () => ({
      message: 'Sign this challenge',
    }))
    const verifyWallet = vi.fn(async () => undefined)

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
        signMessage,
      }),
    )
    mockedUseAppSession.mockReturnValue(
      createSession({
        requestWalletChallenge,
        verifyWallet,
      }),
    )

    render(<App config={baseConfig} />)

    await user.click(screen.getByRole('button', { name: 'Sign in with wallet' }))

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

  it('keeps provider buttons disabled until the wallet session is authenticated', () => {
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
    expect(screen.getByRole('button', { name: 'Connect Twitter' })).toBeDisabled()
  })

  it('unlinks connected providers and signs the user out from the wallet session', async () => {
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
        profile: {
          identities: {
            discord: {
              checkedAt: null,
              connected: true,
              displayName: 'Quest Master',
              error: null,
              expiresAt: null,
              stats: {
                isInTargetServer: true,
              },
              status: 'active',
              userId: '111111111111111111',
              username: 'questmaster',
            },
            github: {
              checkedAt: null,
              connected: true,
              displayName: 'Quest Coder',
              error: null,
              expiresAt: null,
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
              checkedAt: null,
              connected: true,
              displayName: 'Quest Captain',
              error: null,
              expiresAt: null,
              stats: {
                isInTargetChannel: true,
              },
              status: 'active',
              userId: '222222222',
              username: 'questcaptain',
            },
            twitter: {
              checkedAt: null,
              connected: true,
              displayName: 'Quest Tweeter',
              error: null,
              expiresAt: null,
              stats: {},
              status: 'active',
              userId: 'questtweeter',
              username: 'questtweeter',
            },
          },
          onchain: {
            checkedAt: null,
            error: null,
            expiresAt: null,
            numberOfProcesses: 0,
            totalVotes: '0',
          },
          wallet: {
            address: '0x123400000000000000000000000000000000abcd',
          },
        },
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
        unlinkProvider,
      }),
    )

    render(<App config={baseConfig} />)

    await user.click(screen.getByRole('button', { name: 'Disconnect Discord' }))
    await waitFor(() => {
      expect(unlinkProvider).toHaveBeenCalledWith('discord')
    })

    await user.click(screen.getByRole('button', { name: 'Disconnect GitHub' }))
    await waitFor(() => {
      expect(unlinkProvider).toHaveBeenCalledWith('github')
    })

    await user.click(screen.getByRole('button', { name: 'Disconnect Telegram' }))
    await waitFor(() => {
      expect(unlinkProvider).toHaveBeenCalledWith('telegram')
    })

    await user.click(screen.getByRole('button', { name: 'Disconnect Twitter' }))
    await waitFor(() => {
      expect(unlinkProvider).toHaveBeenCalledWith('twitter')
    })

    await user.click(screen.getByRole('button', { name: 'Disconnect wallet' }))

    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1)
      expect(disconnectWallet).toHaveBeenCalledTimes(1)
    })
  })

  it('renders merged profile and onchain stats once the session is authenticated', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        profile: {
          identities: {
            discord: {
              checkedAt: '2026-03-24T12:00:00.000Z',
              connected: true,
              displayName: 'Quest Master',
              error: null,
              expiresAt: '2026-03-25T00:00:00.000Z',
              stats: {
                isInTargetServer: true,
              },
              status: 'active',
              userId: '111111111111111111',
              username: 'questmaster',
            },
            github: {
              checkedAt: '2026-03-24T12:00:00.000Z',
              connected: true,
              displayName: 'Quest Coder',
              error: null,
              expiresAt: '2026-03-25T00:00:00.000Z',
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
              checkedAt: '2026-03-24T12:00:00.000Z',
              connected: true,
              displayName: 'Quest Captain',
              error: null,
              expiresAt: '2026-03-25T00:00:00.000Z',
              stats: {
                isInTargetChannel: true,
              },
              status: 'active',
              userId: '222222222',
              username: 'questcaptain',
            },
            twitter: {
              checkedAt: '2026-03-24T12:00:00.000Z',
              connected: true,
              displayName: 'Quest Tweeter',
              error: null,
              expiresAt: null,
              stats: {},
              status: 'active',
              userId: 'questtweeter',
              username: 'questtweeter',
            },
          },
          onchain: {
            checkedAt: '2026-03-24T12:05:00.000Z',
            error: null,
            expiresAt: '2026-03-24T12:10:00.000Z',
            numberOfProcesses: 2,
            totalVotes: '33',
          },
          wallet: {
            address: '0x123400000000000000000000000000000000abcd',
          },
        },
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
      }),
    )

    render(<App config={baseConfig} />)

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('User stats', {
        discord: {
          checkedAt: '2026-03-24T12:00:00.000Z',
          error: null,
          expiresAt: '2026-03-25T00:00:00.000Z',
          isConnected: true,
          isInTargetServer: true,
          status: 'active',
          userId: '111111111111111111',
          username: 'Quest Master',
        },
        github: {
          checkedAt: '2026-03-24T12:00:00.000Z',
          displayName: 'Quest Coder',
          error: null,
          expiresAt: '2026-03-25T00:00:00.000Z',
          isConnected: true,
          isFollowingTargetOrganization: true,
          isOlderThanOneYear: true,
          publicNonForkRepositoryCount: 12,
          status: 'active',
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
          userId: '333333',
          username: 'questcoder',
        },
        onchain: {
          address: '0x123400000000000000000000000000000000abcd',
          checkedAt: '2026-03-24T12:05:00.000Z',
          error: null,
          expiresAt: '2026-03-24T12:10:00.000Z',
          numberOfProcesses: 2,
          totalVotes: '33',
        },
        telegram: {
          checkedAt: '2026-03-24T12:00:00.000Z',
          displayName: 'Quest Captain',
          error: null,
          expiresAt: '2026-03-25T00:00:00.000Z',
          isConnected: true,
          isInTargetChannel: true,
          status: 'active',
          userId: '222222222',
          username: 'questcaptain',
        },
        twitter: {
          checkedAt: '2026-03-24T12:00:00.000Z',
          displayName: 'Quest Tweeter',
          error: null,
          expiresAt: null,
          isConnected: true,
          status: 'active',
          userId: 'questtweeter',
          username: 'questtweeter',
        },
      })
    })
  })

  it('requests a Twitter proof code and verifies the tweet URL inline', async () => {
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
        profile: {
          identities: {
            discord: {
              checkedAt: null,
              connected: false,
              displayName: null,
              error: null,
              expiresAt: null,
              stats: {
                isInTargetServer: null,
              },
              status: 'disconnected',
              userId: null,
              username: null,
            },
            github: {
              checkedAt: null,
              connected: false,
              displayName: null,
              error: null,
              expiresAt: null,
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
              checkedAt: null,
              connected: false,
              displayName: null,
              error: null,
              expiresAt: null,
              stats: {
                isInTargetChannel: null,
              },
              status: 'disconnected',
              userId: null,
              username: null,
            },
            twitter: {
              checkedAt: null,
              connected: false,
              displayName: null,
              error: null,
              expiresAt: null,
              stats: {},
              status: 'disconnected',
              userId: null,
              username: null,
            },
          },
          onchain: {
            checkedAt: null,
            error: null,
            expiresAt: null,
            numberOfProcesses: 0,
            totalVotes: '0',
          },
          wallet: {
            address: '0x123400000000000000000000000000000000abcd',
          },
        },
        requestTwitterCode,
        sessionWalletAddress: '0x123400000000000000000000000000000000abcd',
        verifyTwitterTweet,
      }),
    )

    render(<App config={baseConfig} />)

    await user.click(screen.getByRole('button', { name: 'Connect Twitter' }))

    await waitFor(() => {
      expect(requestTwitterCode).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText('twitter-proof-code')).toBeInTheDocument()

    await user.type(
      screen.getByLabelText('Tweet URL'),
      'https://x.com/questtweeter/status/1234567890',
    )
    await user.click(screen.getByRole('button', { name: 'Verify tweet' }))

    await waitFor(() => {
      expect(verifyTwitterTweet).toHaveBeenCalledWith(
        'https://x.com/questtweeter/status/1234567890',
      )
    })
  })
})
