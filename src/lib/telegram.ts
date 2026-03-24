type JwtPayload = {
  exp?: number
}

export type TelegramSession = {
  token: string
  expiresAt: number
}

export type TelegramUserStats = {
  displayName: string | null
  isInTargetChannel: boolean | null
  membershipError: string | null
  userId: string
  username: string | null
}

export type TelegramAuthCallback =
  | {
      kind: 'error'
      payload: {
        description: string | null
        error: string
      }
    }
  | {
      kind: 'success'
      payload: {
        token: string
      }
    }

export class TelegramApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'TelegramApiError'
    this.status = status
  }
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

export function buildTelegramApiUrl(baseUrl: string, path: string) {
  return new URL(path.replace(/^\//, ''), normalizeBaseUrl(baseUrl)).toString()
}

function decodeBase64Url(value: string) {
  const normalizedValue = value.replace(/-/g, '+').replace(/_/g, '/')
  const paddingLength = (4 - (normalizedValue.length % 4)) % 4
  const paddedValue = normalizedValue + '='.repeat(paddingLength)

  return atob(paddedValue)
}

function parseJwtPayload(token: string): JwtPayload {
  const parts = token.split('.')

  if (parts.length !== 3 || !parts[1]) {
    throw new Error('Telegram app token is malformed.')
  }

  try {
    return JSON.parse(decodeBase64Url(parts[1])) as JwtPayload
  } catch {
    throw new Error('Telegram app token payload is malformed.')
  }
}

export function createTelegramSessionFromToken(
  token: string,
  now = Date.now(),
): TelegramSession {
  const payload = parseJwtPayload(token)

  if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(now / 1000)) {
    throw new Error('Telegram app token is expired or missing an expiry.')
  }

  return {
    expiresAt: payload.exp * 1000,
    token,
  }
}

export function isTelegramSessionExpired(
  session: TelegramSession,
  now = Date.now(),
) {
  return session.expiresAt <= now
}

export function parseTelegramAuthCallback(hash: string): TelegramAuthCallback | null {
  const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash

  if (!normalizedHash) {
    return null
  }

  const params = new URLSearchParams(normalizedHash)
  const token = params.get('telegram_token')
  const error = params.get('telegram_error')

  if (!token && !error) {
    return null
  }

  if (error) {
    return {
      kind: 'error',
      payload: {
        description: params.get('telegram_error_description'),
        error,
      },
    }
  }

  if (!token) {
    throw new Error('Telegram auth callback is missing the app token.')
  }

  return {
    kind: 'success',
    payload: {
      token,
    },
  }
}

async function readJson(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function fetchTelegramUserStats({
  apiBaseUrl,
  token,
}: {
  apiBaseUrl: string
  token: string
}): Promise<TelegramUserStats> {
  const response = await fetch(buildTelegramApiUrl(apiBaseUrl, '/api/telegram/me'), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const body = await readJson(response)
    const detail =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : 'Failed to load the Telegram account.'

    throw new TelegramApiError(detail, response.status)
  }

  return (await response.json()) as TelegramUserStats
}
