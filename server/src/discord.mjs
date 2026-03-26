const DISCORD_API_BASE_URL = 'https://discord.com/api/v10'
const DISCORD_OAUTH_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize'
const DISCORD_OAUTH_TOKEN_URL = 'https://discord.com/api/oauth2/token'

export const DISCORD_OAUTH_SCOPES = ['identify', 'guilds.members.read']

export class DiscordApiError extends Error {
  status

  constructor(message, status) {
    super(message)
    this.name = 'DiscordApiError'
    this.status = status
  }
}

function parseDiscordTokenResponse(body, message) {
  if (
    !body ||
    typeof body !== 'object' ||
    typeof body.access_token !== 'string' ||
    typeof body.expires_in !== 'number' ||
    typeof body.refresh_token !== 'string' ||
    typeof body.scope !== 'string' ||
    typeof body.token_type !== 'string'
  ) {
    throw new Error(message)
  }

  return {
    accessToken: body.access_token,
    expiresInSeconds: body.expires_in,
    refreshToken: body.refresh_token,
    scope: body.scope,
    tokenType: body.token_type,
  }
}

async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function fetchDiscordResource(path, accessToken, message, fetchImpl = fetch) {
  const response = await fetchImpl(`${DISCORD_API_BASE_URL}${path}`, {
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

  return response.json()
}

async function requestDiscordToken(body, clientId, clientSecret, fetchImpl = fetch) {
  const response = await fetchImpl(DISCORD_OAUTH_TOKEN_URL, {
    body: new URLSearchParams(body).toString(),
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  })
  const tokenBody = (await readJson(response))

  if (!response.ok) {
    const detail =
      tokenBody &&
      typeof tokenBody === 'object' &&
      'error_description' in tokenBody &&
      typeof tokenBody.error_description === 'string'
        ? tokenBody.error_description
        : 'Discord token exchange failed.'

    throw new DiscordApiError(detail, response.status)
  }

  return parseDiscordTokenResponse(tokenBody, 'Discord token response is malformed.')
}

export function buildDiscordAuthorizationUrl(config, state) {
  const url = new URL(DISCORD_OAUTH_AUTHORIZE_URL)

  url.search = new URLSearchParams({
    client_id: config.clientId,
    prompt: 'consent',
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: DISCORD_OAUTH_SCOPES.join(' '),
    state,
  }).toString()

  return url.toString()
}

export async function exchangeDiscordAuthorizationCode(
  {
    clientId,
    clientSecret,
    code,
    redirectUri,
  },
  fetchImpl = fetch,
) {
  return requestDiscordToken(
    {
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    },
    clientId,
    clientSecret,
    fetchImpl,
  )
}

export async function refreshDiscordAccessToken(
  {
    clientId,
    clientSecret,
    refreshToken,
  },
  fetchImpl = fetch,
) {
  return requestDiscordToken(
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
    clientId,
    clientSecret,
    fetchImpl,
  )
}

export async function fetchDiscordUserStats(
  {
    accessToken,
    guildId,
  },
  fetchImpl = fetch,
) {
  const user = await fetchDiscordResource(
    '/users/@me',
    accessToken,
    'Failed to load the Discord account.',
    fetchImpl,
  )

  let isInTargetServer = false

  try {
    await fetchDiscordResource(
      `/users/@me/guilds/${guildId}/member`,
      accessToken,
      'Failed to load Discord server membership.',
      fetchImpl,
    )
    isInTargetServer = true
  } catch (error) {
    if (error instanceof DiscordApiError && error.status === 404) {
      isInTargetServer = false
    } else {
      throw error
    }
  }

  const typedUser = user

  return {
    displayName:
      typedUser &&
      typeof typedUser === 'object' &&
      'global_name' in typedUser &&
      (typedUser.global_name === null || typeof typedUser.global_name === 'string')
        ? typedUser.global_name
        : null,
    isInTargetServer,
    userId:
      typedUser &&
      typeof typedUser === 'object' &&
      'id' in typedUser &&
      typeof typedUser.id === 'string'
        ? typedUser.id
        : null,
    username:
      typedUser &&
      typeof typedUser === 'object' &&
      'username' in typedUser &&
      typeof typedUser.username === 'string'
        ? typedUser.username
        : null,
  }
}
