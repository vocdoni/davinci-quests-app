import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { AppConfig } from './config'
import { useDiscordConnection } from './hooks/useDiscordConnection'
import { useTelegramConnection } from './hooks/useTelegramConnection'
import { useUserStats } from './hooks/useUserStats'
import { useWalletConnection } from './hooks/useWalletConnection'

vi.mock('./hooks/useWalletConnection', () => ({
  useWalletConnection: vi.fn(),
}))

vi.mock('./hooks/useUserStats', () => ({
  useUserStats: vi.fn(),
}))

vi.mock('./hooks/useDiscordConnection', () => ({
  useDiscordConnection: vi.fn(),
}))

vi.mock('./hooks/useTelegramConnection', () => ({
  useTelegramConnection: vi.fn(),
}))

const mockedUseWalletConnection = vi.mocked(useWalletConnection)
const mockedUseUserStats = vi.mocked(useUserStats)
const mockedUseDiscordConnection = vi.mocked(useDiscordConnection)
const mockedUseTelegramConnection = vi.mocked(useTelegramConnection)

const baseConfig: AppConfig = {
  contractAddress: '0x0000000000000000000000000000000000000001',
  discord: {
    clientId: '123456789012345678',
    guildId: '987654321098765432',
    redirectUri: 'https://app.example.org',
  },
  startBlock: 12345n,
  telegram: {
    apiBaseUrl: 'https://api.example.org',
  },
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
    isSwitching: false,
    isWrongNetwork: false,
    primaryConnectorName: 'WalletConnect',
    requestSwitch: vi.fn(),
    switchError: null,
    targetChain: {} as never,
    ...overrides,
  } as never
}

function createWalletStats(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    error: null,
    isError: false,
    isLoading: false,
    isSuccess: false,
    refetch: vi.fn(),
    ...overrides,
  } as never
}

function createDiscordConnection(overrides: Record<string, unknown> = {}) {
  return {
    displayName: null,
    error: null,
    isAuthenticated: false,
    isInTargetServer: null,
    isLoading: false,
    isReady: true,
    login: vi.fn(),
    logout: vi.fn(),
    userId: null,
    username: null,
    ...overrides,
  } as never
}

function createTelegramConnection(overrides: Record<string, unknown> = {}) {
  return {
    displayName: null,
    error: null,
    isAuthenticated: false,
    isInTargetChannel: null,
    isLoading: false,
    isReady: true,
    login: vi.fn(),
    logout: vi.fn(),
    userId: null,
    username: null,
    ...overrides,
  } as never
}

beforeEach(() => {
  mockedUseWalletConnection.mockReset()
  mockedUseUserStats.mockReset()
  mockedUseDiscordConnection.mockReset()
  mockedUseTelegramConnection.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('App', () => {
  it('renders wallet, Discord, and Telegram buttons and triggers all login actions', async () => {
    const user = userEvent.setup()
    const connectPrimaryWallet = vi.fn()
    const loginDiscord = vi.fn()
    const loginTelegram = vi.fn()

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({ connectPrimaryWallet }),
    )
    mockedUseUserStats.mockReturnValue(createWalletStats())
    mockedUseDiscordConnection.mockReturnValue(
      createDiscordConnection({ login: loginDiscord }),
    )
    mockedUseTelegramConnection.mockReturnValue(
      createTelegramConnection({ login: loginTelegram }),
    )

    render(<App config={baseConfig} />)

    await user.click(screen.getByRole('button', { name: 'Connect wallet' }))
    await user.click(screen.getByRole('button', { name: 'Login with Discord' }))
    await user.click(screen.getByRole('button', { name: 'Login with Telegram' }))

    expect(connectPrimaryWallet).toHaveBeenCalledTimes(1)
    expect(loginDiscord).toHaveBeenCalledTimes(1)
    expect(loginTelegram).toHaveBeenCalledTimes(1)
  })

  it('logs merged user stats once wallet, Discord, and Telegram data are ready', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseUserStats.mockReturnValue(
      createWalletStats({
        data: {
          createdProcesses: [],
          createdProcessesCount: 2,
          totalVotersAcrossCreatedProcesses: 33n,
        },
        isSuccess: true,
      }),
    )
    mockedUseDiscordConnection.mockReturnValue(
      createDiscordConnection({
        displayName: 'Quest Master',
        isAuthenticated: true,
        isInTargetServer: true,
        userId: '111111111111111111',
        username: 'questmaster',
      }),
    )
    mockedUseTelegramConnection.mockReturnValue(
      createTelegramConnection({
        displayName: 'Quest Captain',
        isAuthenticated: true,
        isInTargetChannel: true,
        userId: '222222222',
        username: 'questcaptain',
      }),
    )

    render(<App config={baseConfig} />)

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('User stats', {
        discord: {
          isAuthenticated: true,
          isInTargetServer: true,
          userId: '111111111111111111',
          username: 'Quest Master',
        },
        onchain: {
          address: '0x123400000000000000000000000000000000abcd',
          numberOfProcesses: 2,
          totalVotes: '33',
        },
        telegram: {
          displayName: 'Quest Captain',
          isAuthenticated: true,
          isInTargetChannel: true,
          userId: '222222222',
          username: 'questcaptain',
        },
      })
    })

    const table = screen.getByRole('table')

    expect(table).toBeVisible()
    expect(screen.getAllByText('discord')).toHaveLength(4)
    expect(screen.getByText('isInTargetServer')).toBeVisible()
    expect(screen.getByText('Quest Master')).toBeVisible()
    expect(screen.getByText('Quest Captain')).toBeVisible()
    expect(screen.getByText('33')).toBeVisible()
  })

  it('logs wallet stats with logged-out social providers when neither provider is connected', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseUserStats.mockReturnValue(
      createWalletStats({
        data: {
          createdProcesses: [],
          createdProcessesCount: 1,
          totalVotersAcrossCreatedProcesses: 7n,
        },
        isSuccess: true,
      }),
    )
    mockedUseDiscordConnection.mockReturnValue(createDiscordConnection())
    mockedUseTelegramConnection.mockReturnValue(createTelegramConnection())

    render(<App config={baseConfig} />)

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('User stats', {
        discord: {
          isAuthenticated: false,
          isInTargetServer: null,
          userId: null,
          username: null,
        },
        onchain: {
          address: '0x123400000000000000000000000000000000abcd',
          numberOfProcesses: 1,
          totalVotes: '7',
        },
        telegram: {
          displayName: null,
          isAuthenticated: false,
          isInTargetChannel: null,
          userId: null,
          username: null,
        },
      })
    })
  })

  it('does not log while Telegram is still unresolved', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        isConnected: true,
      }),
    )
    mockedUseUserStats.mockReturnValue(
      createWalletStats({
        data: {
          createdProcesses: [],
          createdProcessesCount: 1,
          totalVotersAcrossCreatedProcesses: 7n,
        },
        isSuccess: true,
      }),
    )
    mockedUseDiscordConnection.mockReturnValue(createDiscordConnection())
    mockedUseTelegramConnection.mockReturnValue(
      createTelegramConnection({
        isLoading: true,
        isReady: false,
      }),
    )

    render(<App config={baseConfig} />)

    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('auto-requests a network switch and disables wallet stats on the wrong network', () => {
    const requestSwitch = vi.fn()

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        chainId: 1,
        connectors: [],
        isConnected: true,
        isWrongNetwork: true,
        requestSwitch,
      }),
    )
    mockedUseUserStats.mockReturnValue(createWalletStats())
    mockedUseDiscordConnection.mockReturnValue(createDiscordConnection())
    mockedUseTelegramConnection.mockReturnValue(createTelegramConnection())

    render(<App config={baseConfig} />)

    expect(requestSwitch).toHaveBeenCalledTimes(1)
    expect(mockedUseUserStats).toHaveBeenCalledWith({
      address: '0x123400000000000000000000000000000000abcd',
      enabled: false,
    })
  })

  it('shows disconnect actions for wallet, Discord, and Telegram once connected', async () => {
    const user = userEvent.setup()
    const disconnectWallet = vi.fn()
    const logoutDiscord = vi.fn()
    const logoutTelegram = vi.fn()

    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        address: '0x123400000000000000000000000000000000abcd',
        connectors: [],
        disconnectWallet,
        isConnected: true,
      }),
    )
    mockedUseUserStats.mockReturnValue(
      createWalletStats({
        data: {
          createdProcesses: [],
          createdProcessesCount: 0,
          totalVotersAcrossCreatedProcesses: 0n,
        },
        isSuccess: true,
      }),
    )
    mockedUseDiscordConnection.mockReturnValue(
      createDiscordConnection({
        isAuthenticated: true,
        logout: logoutDiscord,
        userId: '111111111111111111',
        username: 'questmaster',
      }),
    )
    mockedUseTelegramConnection.mockReturnValue(
      createTelegramConnection({
        isAuthenticated: true,
        logout: logoutTelegram,
        userId: '222222222',
        username: 'questcaptain',
      }),
    )

    render(<App config={baseConfig} />)

    await user.click(screen.getByRole('button', { name: 'Disconnect wallet' }))
    await user.click(screen.getByRole('button', { name: 'Disconnect Discord' }))
    await user.click(screen.getByRole('button', { name: 'Disconnect Telegram' }))

    expect(disconnectWallet).toHaveBeenCalledTimes(1)
    expect(logoutDiscord).toHaveBeenCalledTimes(1)
    expect(logoutTelegram).toHaveBeenCalledTimes(1)
  })

  it('shows loading labels while wallet, Discord, or Telegram are busy', () => {
    mockedUseWalletConnection.mockReturnValue(
      createWalletConnection({
        connectors: [{ id: 'walletConnect', name: 'WalletConnect' }],
        isConnecting: true,
      }),
    )
    mockedUseUserStats.mockReturnValue(createWalletStats())
    mockedUseDiscordConnection.mockReturnValue(
      createDiscordConnection({
        isLoading: true,
      }),
    )
    mockedUseTelegramConnection.mockReturnValue(
      createTelegramConnection({
        isLoading: true,
      }),
    )

    render(<App config={baseConfig} />)

    expect(screen.getByRole('button', { name: 'Connecting wallet...' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Connecting Discord...' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Connecting Telegram...' })).toBeVisible()
  })
})
