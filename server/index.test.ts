// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTelegramApiServer,
  createTelegramDependencies,
} from './index.mjs'
import {
  createTelegramAppToken,
  createTelegramStateToken,
  verifyTelegramStateToken,
} from './telegram.mjs'

const baseConfig = {
  botToken: '123456:telegram-bot-token',
  channelUsername: '@quest_channel',
  clientId: '123456',
  clientSecret: 'telegram-client-secret',
  frontendAppUrl: 'https://app.example.org',
  frontendOrigin: 'https://app.example.org',
  jwtSecret: 'super-secret',
  port: 3001,
  redirectUri: 'https://api.example.org/api/telegram/auth/callback',
}

function createMockResponse() {
  const headers = new Map<string, string>()

  let body = ''
  let resolveFinished: (() => void) | null = null

  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve
  })

  return {
    body,
    end(chunk?: string) {
      body = typeof chunk === 'string' ? chunk : ''
      this.body = body
      resolveFinished?.()
    },
    finished,
    getHeader(name: string) {
      return headers.get(name.toLowerCase())
    },
    headers,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value)
    },
    statusCode: 200,
  }
}

async function performRequest(
  dependencies: Record<string, unknown>,
  {
    headers = {},
    method,
    url,
  }: {
    headers?: Record<string, string>
    method: string
    url: string
  },
) {
  const server = createTelegramApiServer(baseConfig, dependencies as never)
  const response = createMockResponse()
  const request = {
    headers: {
      host: 'api.example.org',
      ...headers,
    },
    method,
    url,
  }

  server.emit('request', request, response)
  await response.finished

  return response
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('telegram API server', () => {
  it('wires the default Telegram dependency verifiers to the real token helpers', () => {
    const dependencies = createTelegramDependencies(vi.fn())
    const now = Date.now()
    const stateToken = createTelegramStateToken(
      {
        codeVerifier: 'code-verifier',
        nonce: 'nonce-value',
      },
      'super-secret',
      now,
    )
    const appToken = createTelegramAppToken(
      {
        displayName: 'Quest Captain',
        frontendAppUrl: 'https://app.example.org',
        subject: 'telegram-subject',
        telegramId: '222222222',
        username: 'questcaptain',
      },
      'super-secret',
      now,
    )

    expect(dependencies.verifyStateToken(stateToken, 'super-secret')).toEqual({
      codeVerifier: 'code-verifier',
      nonce: 'nonce-value',
    })
    expect(
      dependencies.verifyAppToken(appToken, 'super-secret', {
        expectedAudience: 'https://app.example.org',
      }),
    ).toEqual({
      displayName: 'Quest Captain',
      subject: 'telegram-subject',
      telegramId: '222222222',
      username: 'questcaptain',
    })
  })

  it('redirects auth/start to Telegram with a signed state token', async () => {
    const response = await performRequest(
      {
        createPkceChallenge: vi.fn(() => 'pkce-challenge'),
        createRandomToken: vi
          .fn()
          .mockReturnValueOnce('nonce-value')
          .mockReturnValueOnce('code-verifier'),
        createTelegramAppToken: vi.fn(),
        createTelegramStateToken: vi.fn((payload, secret) =>
          createTelegramStateToken(payload, secret, 1_000),
        ),
        exchangeAuthorizationCode: vi.fn(),
        fetchChannelMembership: vi.fn(),
        getOidcConfiguration: vi.fn(async () => ({
          authorizationEndpoint: 'https://oauth.telegram.org/auth',
          issuer: 'https://oauth.telegram.org',
          jwksUri: 'https://oauth.telegram.org/jwks',
          tokenEndpoint: 'https://oauth.telegram.org/token',
        })),
        verifyAppToken: vi.fn(),
        verifyIdToken: vi.fn(),
        verifyStateToken: vi.fn((token, secret) =>
          verifyTelegramStateToken(token, secret, 2_000),
        ),
      },
      {
        method: 'GET',
        url: '/api/telegram/auth/start',
      },
    )

    const location = response.getHeader('location')

    expect(response.statusCode).toBe(302)
    expect(location).toBeTruthy()

    const redirectUrl = new URL(location!)
    const stateToken = redirectUrl.searchParams.get('state')

    expect(redirectUrl.origin + redirectUrl.pathname).toBe(
      'https://oauth.telegram.org/auth',
    )
    expect(redirectUrl.searchParams.get('code_challenge')).toBe('pkce-challenge')
    expect(redirectUrl.searchParams.get('nonce')).toBe('nonce-value')
    expect(stateToken).toBeTruthy()
  })

  it('redirects callback failures back to the frontend with an error fragment', async () => {
    const response = await performRequest(
      {
        createPkceChallenge: vi.fn(),
        createRandomToken: vi.fn(),
        createTelegramAppToken: vi.fn(),
        createTelegramStateToken: vi.fn(),
        exchangeAuthorizationCode: vi.fn(),
        fetchChannelMembership: vi.fn(),
        getOidcConfiguration: vi.fn(),
        verifyAppToken: vi.fn(),
        verifyIdToken: vi.fn(),
        verifyStateToken: vi.fn(() => {
          throw new Error('Telegram auth state is invalid.')
        }),
      },
      {
        method: 'GET',
        url: '/api/telegram/auth/callback?code=oauth-code&state=bad-state',
      },
    )

    const location = response.getHeader('location')

    expect(response.statusCode).toBe(302)
    expect(location).toContain('telegram_error=telegram_auth_failed')
    expect(location).toContain(
      'telegram_error_description=Telegram+auth+state+is+invalid.',
    )
  })

  it('redirects callback token-exchange failures back to the frontend with an error fragment', async () => {
    const response = await performRequest(
      {
        createPkceChallenge: vi.fn(),
        createRandomToken: vi.fn(),
        createTelegramAppToken: vi.fn(),
        createTelegramStateToken: vi.fn(),
        exchangeAuthorizationCode: vi.fn(async () => {
          throw new Error('Token exchange failed.')
        }),
        fetchChannelMembership: vi.fn(),
        getOidcConfiguration: vi.fn(async () => ({
          authorizationEndpoint: 'https://oauth.telegram.org/auth',
          issuer: 'https://oauth.telegram.org',
          jwksUri: 'https://oauth.telegram.org/jwks',
          tokenEndpoint: 'https://oauth.telegram.org/token',
        })),
        verifyAppToken: vi.fn(),
        verifyIdToken: vi.fn(),
        verifyStateToken: vi.fn(() => ({
          codeVerifier: 'code-verifier',
          nonce: 'nonce-value',
        })),
      },
      {
        method: 'GET',
        url: '/api/telegram/auth/callback?code=oauth-code&state=signed-state',
      },
    )

    const location = response.getHeader('location')

    expect(response.statusCode).toBe(302)
    expect(location).toContain('telegram_error=telegram_auth_failed')
    expect(location).toContain('telegram_error_description=Token+exchange+failed.')
  })

  it('redirects a successful callback back to the frontend with a fragment token', async () => {
    const createAppTokenSpy = vi.fn(() =>
      createTelegramAppToken(
        {
          displayName: 'Quest Captain',
          frontendAppUrl: 'https://app.example.org',
          subject: 'telegram-subject',
          telegramId: '222222222',
          username: 'questcaptain',
        },
        'super-secret',
        1_000,
      ),
    )
    const response = await performRequest(
      {
        createPkceChallenge: vi.fn(),
        createRandomToken: vi.fn(),
        createTelegramAppToken: createAppTokenSpy,
        createTelegramStateToken: vi.fn(),
        exchangeAuthorizationCode: vi.fn(async () => ({
          idToken: 'telegram-id-token',
        })),
        fetchChannelMembership: vi.fn(),
        getOidcConfiguration: vi.fn(async () => ({
          authorizationEndpoint: 'https://oauth.telegram.org/auth',
          issuer: 'https://oauth.telegram.org',
          jwksUri: 'https://oauth.telegram.org/jwks',
          tokenEndpoint: 'https://oauth.telegram.org/token',
        })),
        verifyAppToken: vi.fn(),
        verifyIdToken: vi.fn(async () => ({
          displayName: 'Quest Captain',
          subject: 'telegram-subject',
          telegramId: '222222222',
          username: 'questcaptain',
        })),
        verifyStateToken: vi.fn(() => ({
          codeVerifier: 'code-verifier',
          nonce: 'nonce-value',
        })),
      },
      {
        method: 'GET',
        url: '/api/telegram/auth/callback?code=oauth-code&state=signed-state',
      },
    )

    const location = response.getHeader('location')

    expect(response.statusCode).toBe(302)
    expect(location).toContain('https://app.example.org')
    expect(location).toContain('telegram_token=')
    expect(createAppTokenSpy).toHaveBeenCalledTimes(1)
  })

  it('returns 401 from /api/telegram/me when the app token is invalid', async () => {
    const response = await performRequest(
      {
        createPkceChallenge: vi.fn(),
        createRandomToken: vi.fn(),
        createTelegramAppToken: vi.fn(),
        createTelegramStateToken: vi.fn(),
        exchangeAuthorizationCode: vi.fn(),
        fetchChannelMembership: vi.fn(),
        getOidcConfiguration: vi.fn(),
        verifyAppToken: vi.fn(() => {
          throw new Error('Unauthorized')
        }),
        verifyIdToken: vi.fn(),
        verifyStateToken: vi.fn(),
      },
      {
        headers: {
          authorization: 'Bearer bad-token',
        },
        method: 'GET',
        url: '/api/telegram/me',
      },
    )

    expect(response.statusCode).toBe(401)
    expect(response.body).toBe(JSON.stringify({ message: 'Unauthorized' }))
  })

  it('returns Telegram identity even when the channel membership lookup fails', async () => {
    const response = await performRequest(
      {
        createPkceChallenge: vi.fn(),
        createRandomToken: vi.fn(),
        createTelegramAppToken: vi.fn(),
        createTelegramStateToken: vi.fn(),
        exchangeAuthorizationCode: vi.fn(),
        fetchChannelMembership: vi.fn(async () => {
          throw new Error('Forbidden: bot is not an administrator of the target chat.')
        }),
        getOidcConfiguration: vi.fn(),
        verifyAppToken: vi.fn(() => ({
          displayName: 'Quest Captain',
          subject: 'telegram-subject',
          telegramId: '222222222',
          username: 'questcaptain',
        })),
        verifyIdToken: vi.fn(),
        verifyStateToken: vi.fn(),
      },
      {
        headers: {
          authorization: 'Bearer good-token',
        },
        method: 'GET',
        url: '/api/telegram/me',
      },
    )

    expect(response.statusCode).toBe(200)
    expect(response.body).toBe(
      JSON.stringify({
        displayName: 'Quest Captain',
        isInTargetChannel: null,
        membershipError:
          'Forbidden: bot is not an administrator of the target chat.',
        userId: '222222222',
        username: 'questcaptain',
      }),
    )
  })
})
