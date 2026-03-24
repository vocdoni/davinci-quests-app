// @vitest-environment node

import {
  generateKeyPairSync,
  createSign,
} from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  buildTelegramAuthorizationUrl,
  createTelegramAppToken,
  createTelegramStateToken,
  mapTelegramChatMemberStatus,
  normalizeChannelUsername,
  verifyTelegramAppToken,
  verifyTelegramIdToken,
  verifyTelegramStateToken,
} from './telegram.mjs'

function encodeBase64Url(value: string | Buffer) {
  const bufferValue = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8')

  return bufferValue
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function signIdToken(payload: Record<string, unknown>, kid = 'test-key-1') {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })
  const encodedHeader = encodeBase64Url(
    JSON.stringify({
      alg: 'RS256',
      kid,
      typ: 'JWT',
    }),
  )
  const encodedPayload = encodeBase64Url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signer = createSign('RSA-SHA256')

  signer.update(signingInput)
  signer.end()

  const idToken = `${signingInput}.${encodeBase64Url(signer.sign(privateKey))}`
  const jwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid,
    use: 'sig',
  }

  return { idToken, jwk }
}

describe('telegram backend helpers', () => {
  it('builds the authorization URL with PKCE, state, and nonce', () => {
    const url = new URL(
      buildTelegramAuthorizationUrl(
        {
          authorizationEndpoint: 'https://oauth.telegram.org/auth',
          clientId: '123456',
          redirectUri: 'https://api.example.org/api/telegram/auth/callback',
        },
        {
          codeChallenge: 'pkce-challenge',
          nonce: 'nonce-value',
          state: 'signed-state-token',
        },
      ),
    )

    expect(url.origin + url.pathname).toBe('https://oauth.telegram.org/auth')
    expect(url.searchParams.get('client_id')).toBe('123456')
    expect(url.searchParams.get('code_challenge')).toBe('pkce-challenge')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('nonce')).toBe('nonce-value')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('openid profile')
    expect(url.searchParams.get('state')).toBe('signed-state-token')
  })

  it('creates a signed state token and rejects tampered values', () => {
    const stateToken = createTelegramStateToken(
      {
        codeVerifier: 'code-verifier',
        nonce: 'nonce-value',
      },
      'super-secret',
      1_000,
    )

    expect(verifyTelegramStateToken(stateToken, 'super-secret', 2_000)).toEqual({
      codeVerifier: 'code-verifier',
      nonce: 'nonce-value',
      walletAddress: null,
    })
    expect(() =>
      verifyTelegramStateToken(`${stateToken}tampered`, 'super-secret', 2_000),
    ).toThrow('Telegram auth state is invalid.')
  })

  it('verifies a valid Telegram id_token against the supplied JWKS', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000)
    const { idToken, jwk } = signIdToken({
      aud: '123456',
      exp: nowSeconds + 3600,
      iat: nowSeconds,
      id: 222222222,
      iss: 'https://oauth.telegram.org',
      name: 'Quest Captain',
      nonce: 'nonce-value',
      preferred_username: 'questcaptain',
      sub: 'telegram-subject',
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }),
    )

    await expect(
      verifyTelegramIdToken(
        {
          clientId: '123456',
          expectedIssuer: 'https://oauth.telegram.org',
          expectedNonce: 'nonce-value',
          idToken,
          jwksUri: 'https://oauth.telegram.org/jwks',
        },
        fetchMock,
      ),
    ).resolves.toEqual({
      displayName: 'Quest Captain',
      subject: 'telegram-subject',
      telegramId: '222222222',
      username: 'questcaptain',
    })
  })

  it('rejects invalid issuer, audience, and expired Telegram id_tokens', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000)

    const invalidCases = [
      {
        aud: '123456',
        error: 'Telegram id_token issuer is invalid.',
        exp: nowSeconds + 3600,
        iss: 'https://wrong-issuer.example.org',
      },
      {
        aud: '654321',
        error: 'Telegram id_token audience is invalid.',
        exp: nowSeconds + 3600,
        iss: 'https://oauth.telegram.org',
      },
      {
        aud: '123456',
        error: 'Telegram id_token has expired.',
        exp: nowSeconds - 1,
        iss: 'https://oauth.telegram.org',
      },
    ]

    for (const invalidCase of invalidCases) {
      const { idToken, jwk } = signIdToken({
        aud: invalidCase.aud,
        exp: invalidCase.exp,
        iat: nowSeconds - 10,
        id: 222222222,
        iss: invalidCase.iss,
        nonce: 'nonce-value',
        sub: 'telegram-subject',
      })
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }),
      )

      await expect(
        verifyTelegramIdToken(
          {
            clientId: '123456',
            expectedIssuer: 'https://oauth.telegram.org',
            expectedNonce: 'nonce-value',
            idToken,
            jwksUri: 'https://oauth.telegram.org/jwks',
          },
          fetchMock,
          nowSeconds * 1000,
        ),
      ).rejects.toThrow(invalidCase.error)
    }
  })

  it('creates and verifies the Telegram app token', () => {
    const appToken = createTelegramAppToken(
      {
        displayName: 'Quest Captain',
        frontendAppUrl: 'https://app.example.org',
        subject: 'telegram-subject',
        telegramId: '222222222',
        username: 'questcaptain',
      },
      'super-secret',
      1_000,
    )

    expect(
      verifyTelegramAppToken(
        appToken,
        'super-secret',
        { expectedAudience: 'https://app.example.org' },
        2_000,
      ),
    ).toEqual({
      displayName: 'Quest Captain',
      subject: 'telegram-subject',
      telegramId: '222222222',
      username: 'questcaptain',
    })
  })

  it('normalizes the configured channel username and maps channel membership statuses', () => {
    expect(normalizeChannelUsername('quest_channel')).toBe('@quest_channel')
    expect(normalizeChannelUsername('@quest_channel')).toBe('@quest_channel')
    expect(mapTelegramChatMemberStatus('member')).toBe(true)
    expect(mapTelegramChatMemberStatus('administrator')).toBe(true)
    expect(mapTelegramChatMemberStatus('creator')).toBe(true)
    expect(mapTelegramChatMemberStatus('restricted')).toBe(true)
    expect(mapTelegramChatMemberStatus('left')).toBe(false)
    expect(mapTelegramChatMemberStatus('kicked')).toBe(false)
  })
})
