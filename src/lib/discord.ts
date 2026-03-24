import type { DiscordConfig } from '../config'

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10'
const DISCORD_OAUTH_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize'

export const DISCORD_OAUTH_SCOPES = ['identify', 'guilds.members.read'] as const

export type DiscordSession = {
  accessToken: string
  expiresAt: number
  scope: string
  tokenType: string
}

export type DiscordUserStats = {
  displayName: string | null
  isInTargetServer: boolean
  userId: string
  username: string
}

export type DiscordOAuthSuccessPayload = {
  accessToken: string
  expiresInSeconds: number
  scope: string
  state: string
  tokenType: string
}

export type DiscordOAuthErrorPayload = {
  error: string
  errorDescription: string | null
  state: string | null
}

export type DiscordOAuthCallback =
  | {
      kind: 'error'
      payload: DiscordOAuthErrorPayload
    }
  | {
      kind: 'success'
      payload: DiscordOAuthSuccessPayload
    }

type DiscordUserResponse = {
  global_name: string | null
  id: string
  username: string
}

export class DiscordApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'DiscordApiError'
    this.status = status
  }
}

export function buildDiscordAuthorizationUrl(
  config: DiscordConfig,
  state: string,
) {
  const url = new URL(DISCORD_OAUTH_AUTHORIZE_URL)

  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'token',
    scope: DISCORD_OAUTH_SCOPES.join(' '),
    state,
  }).toString()

  return url.toString()
}

export function createDiscordOAuthState() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint8Array(16)
    globalThis.crypto.getRandomValues(values)

    return [...values]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  }

  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
}

export function parseDiscordOAuthCallback(hash: string): DiscordOAuthCallback | null {
  const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash
  if (!normalizedHash) {
    return null
  }

  const params = new URLSearchParams(normalizedHash)
  const accessToken = params.get('access_token')
  const error = params.get('error')

  if (!accessToken && !error) {
    return null
  }

  if (error) {
    return {
      kind: 'error',
      payload: {
        error,
        errorDescription: params.get('error_description'),
        state: params.get('state'),
      },
    }
  }

  const expiresIn = Number(params.get('expires_in'))
  const state = params.get('state')
  const tokenType = params.get('token_type')

  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0 || !state || !tokenType) {
    throw new Error('Discord OAuth callback is missing required fields.')
  }

  const confirmedAccessToken = accessToken

  return {
    kind: 'success',
    payload: {
      accessToken: confirmedAccessToken,
      expiresInSeconds: expiresIn,
      scope: params.get('scope') ?? '',
      state,
      tokenType,
    },
  }
}

export function createDiscordSessionFromCallback(
  payload: DiscordOAuthSuccessPayload,
  now = Date.now(),
): DiscordSession {
  return {
    accessToken: payload.accessToken,
    expiresAt: now + payload.expiresInSeconds * 1000,
    scope: payload.scope,
    tokenType: payload.tokenType,
  }
}

export function isDiscordSessionExpired(
  session: DiscordSession,
  now = Date.now(),
) {
  return session.expiresAt <= now
}

async function readJson(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function fetchDiscordResource<T>(
  path: string,
  accessToken: string,
  message: string,
) {
  const response = await fetch(`${DISCORD_API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const body = await readJson(response)
    const detail =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : message

    throw new DiscordApiError(detail, response.status)
  }

  return (await response.json()) as T
}

export async function fetchDiscordUserStats({
  accessToken,
  guildId,
}: {
  accessToken: string
  guildId: string
}): Promise<DiscordUserStats> {
  const user = await fetchDiscordResource<DiscordUserResponse>(
    '/users/@me',
    accessToken,
    'Failed to load the Discord account.',
  )

  let isInTargetServer = false

  try {
    await fetchDiscordResource(
      `/users/@me/guilds/${guildId}/member`,
      accessToken,
      'Failed to load Discord server membership.',
    )
    isInTargetServer = true
  } catch (error) {
    if (error instanceof DiscordApiError && error.status === 404) {
      isInTargetServer = false
    } else {
      throw error
    }
  }

  return {
    displayName: user.global_name,
    isInTargetServer,
    userId: user.id,
    username: user.username,
  }
}
