import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '../config'
import { useTelegramConnection } from './useTelegramConnection'

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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function createAppLikeJwt(payload: Record<string, unknown>) {
  const encodedHeader = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const encodedPayload = encodeBase64Url(JSON.stringify(payload))

  return `${encodedHeader}.${encodedPayload}.signature`
}

afterEach(() => {
  window.sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useTelegramConnection', () => {
  it('stores the fragment token in sessionStorage and clears the URL hash after bootstrap', async () => {
    const appToken = createAppLikeJwt({
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          displayName: 'Quest Captain',
          isInTargetChannel: true,
          userId: '222222222',
          username: 'questcaptain',
        }),
        { status: 200 },
      ),
    )

    vi.stubGlobal('fetch', fetchMock)
    window.history.replaceState({}, '', `/#telegram_token=${appToken}`)

    const { result } = renderHook(() => useTelegramConnection(baseConfig), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isReady).toBe(true)
      expect(result.current.isAuthenticated).toBe(true)
    })

    expect(
      window.sessionStorage.getItem(
        'quests-dashboard.telegram.session:https://api.example.org',
      ),
    ).toContain(appToken)
    expect(window.location.hash).toBe('')
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.org/api/telegram/me', {
      headers: {
        Authorization: `Bearer ${appToken}`,
      },
    })
  })

  it('clears the local session after a 401 from the Telegram API', async () => {
    const appToken = createAppLikeJwt({
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }),
    )

    vi.stubGlobal('fetch', fetchMock)
    window.sessionStorage.setItem(
      'quests-dashboard.telegram.session:https://api.example.org',
      JSON.stringify({
        expiresAt: Date.now() + 3600_000,
        token: appToken,
      }),
    )

    const { result } = renderHook(() => useTelegramConnection(baseConfig), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.error).toBe('Telegram session expired. Please sign in again.')
    })

    expect(
      window.sessionStorage.getItem(
        'quests-dashboard.telegram.session:https://api.example.org',
      ),
    ).toBeNull()
  })

  it('keeps the Telegram identity when membership cannot be confirmed', async () => {
    const appToken = createAppLikeJwt({
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          displayName: 'Quest Captain',
          isInTargetChannel: null,
          membershipError:
            'Forbidden: bot is not an administrator of the target chat.',
          userId: '222222222',
          username: 'questcaptain',
        }),
        { status: 200 },
      ),
    )

    vi.stubGlobal('fetch', fetchMock)
    window.sessionStorage.setItem(
      'quests-dashboard.telegram.session:https://api.example.org',
      JSON.stringify({
        expiresAt: Date.now() + 3600_000,
        token: appToken,
      }),
    )

    const { result } = renderHook(() => useTelegramConnection(baseConfig), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isReady).toBe(true)
      expect(result.current.isAuthenticated).toBe(true)
    })

    expect(result.current.userId).toBe('222222222')
    expect(result.current.username).toBe('questcaptain')
    expect(result.current.isInTargetChannel).toBeNull()
    expect(result.current.error).toBe(
      'Forbidden: bot is not an administrator of the target chat.',
    )
  })

  it('reports a logged-out ready state when no Telegram session exists', async () => {
    const fetchMock = vi.fn()

    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useTelegramConnection(baseConfig), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isReady).toBe(true)
    })

    expect(result.current.isAuthenticated).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
