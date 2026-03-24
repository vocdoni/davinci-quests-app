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
    requestWalletChallenge: vi.fn(async () => ({ message: 'Sign this challenge' })),
    sessionWalletAddress: null,
    startProviderConnection: vi.fn(),
    unlinkProvider: vi.fn(async () => undefined),
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
    expect(screen.getByRole('button', { name: 'Connect Telegram' })).toBeDisabled()
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

    await user.click(screen.getByRole('button', { name: 'Disconnect Telegram' }))
    await waitFor(() => {
      expect(unlinkProvider).toHaveBeenCalledWith('telegram')
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
      })
    })

    expect(screen.getByRole('table')).toBeVisible()
    expect(screen.getByText('Quest Master')).toBeVisible()
    expect(screen.getByText('Quest Captain')).toBeVisible()
    expect(screen.getByText('33')).toBeVisible()
  })
})
