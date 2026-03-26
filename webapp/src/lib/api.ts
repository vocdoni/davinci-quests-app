export class ApiError extends Error {
  data: unknown
  status: number

  constructor(message: string, status: number, data: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

async function readJson(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export function buildApiUrl(baseUrl: string, path: string) {
  return new URL(path.replace(/^\//, ''), normalizeBaseUrl(baseUrl)).toString()
}

export async function requestJson<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(buildApiUrl(baseUrl, path), {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : null),
      ...(init.headers ?? {}),
    },
  })
  const body = await readJson(response)

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : 'API request failed.'

    throw new ApiError(message, response.status, body)
  }

  return body as T
}

export async function requestVoid(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
) {
  const response = await fetch(buildApiUrl(baseUrl, path), {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : null),
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await readJson(response)
    const message =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : 'API request failed.'

    throw new ApiError(message, response.status, body)
  }
}
