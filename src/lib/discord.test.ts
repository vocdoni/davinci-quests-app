import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildDiscordAuthorizationUrl,
  createDiscordSessionFromCallback,
  DiscordApiError,
  fetchDiscordUserStats,
  isDiscordSessionExpired,
  parseDiscordOAuthCallback,
} from './discord'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('discord helpers', () => {
  it('builds the Discord authorization URL with the expected scopes', () => {
    const url = new URL(
      buildDiscordAuthorizationUrl(
        {
          clientId: '123456789012345678',
          guildId: '987654321098765432',
          redirectUri: 'https://app.example.org/callback',
        },
        'oauth-state',
      ),
    )

    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize')
    expect(url.searchParams.get('client_id')).toBe('123456789012345678')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://app.example.org/callback',
    )
    expect(url.searchParams.get('response_type')).toBe('token')
    expect(url.searchParams.get('scope')).toBe('identify guilds.members.read')
    expect(url.searchParams.get('state')).toBe('oauth-state')
  })

  it('parses a successful OAuth callback from the URL hash', () => {
    expect(
      parseDiscordOAuthCallback(
        '#access_token=token-123&token_type=Bearer&expires_in=3600&scope=identify%20guilds.members.read&state=oauth-state',
      ),
    ).toEqual({
      kind: 'success',
      payload: {
        accessToken: 'token-123',
        expiresInSeconds: 3600,
        scope: 'identify guilds.members.read',
        state: 'oauth-state',
        tokenType: 'Bearer',
      },
    })
  })

  it('creates an expiring Discord session from the callback payload', () => {
    const session = createDiscordSessionFromCallback(
      {
        accessToken: 'token-123',
        expiresInSeconds: 60,
        scope: 'identify guilds.members.read',
        state: 'oauth-state',
        tokenType: 'Bearer',
      },
      1_000,
    )

    expect(session).toEqual({
      accessToken: 'token-123',
      expiresAt: 61_000,
      scope: 'identify guilds.members.read',
      tokenType: 'Bearer',
    })
    expect(isDiscordSessionExpired(session, 60_999)).toBe(false)
    expect(isDiscordSessionExpired(session, 61_000)).toBe(true)
  })

  it('returns Discord stats when the user is in the target server', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            global_name: 'Quest Master',
            id: '111111111111111111',
            username: 'questmaster',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ joined_at: '2025-01-01T00:00:00.000Z' }), {
          status: 200,
        }),
      )

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchDiscordUserStats({
        accessToken: 'token-123',
        guildId: '987654321098765432',
      }),
    ).resolves.toEqual({
      displayName: 'Quest Master',
      isInTargetServer: true,
      userId: '111111111111111111',
      username: 'questmaster',
    })
  })

  it('marks the user as outside the target server on a 404 membership lookup', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            global_name: null,
            id: '111111111111111111',
            username: 'questmaster',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Unknown Member' }), {
          status: 404,
        }),
      )

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchDiscordUserStats({
        accessToken: 'token-123',
        guildId: '987654321098765432',
      }),
    ).resolves.toEqual({
      displayName: null,
      isInTargetServer: false,
      userId: '111111111111111111',
      username: 'questmaster',
    })
  })

  it('surfaces unauthorized Discord responses as API errors', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ message: '401: Unauthorized' }), {
        status: 401,
      }),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchDiscordUserStats({
        accessToken: 'token-123',
        guildId: '987654321098765432',
      }),
    ).rejects.toEqual(new DiscordApiError('401: Unauthorized', 401))
  })
})
