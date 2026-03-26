const TWITTER_OEMBED_URL = 'https://publish.twitter.com/oembed'
const SUPPORTED_TWITTER_HOSTS = new Set([
  'mobile.twitter.com',
  'm.twitter.com',
  'twitter.com',
  'www.twitter.com',
  'www.x.com',
  'x.com',
])

export class TwitterApiError extends Error {
  status

  constructor(message, status) {
    super(message)
    this.name = 'TwitterApiError'
    this.status = status
  }
}

function decodeHtmlEntity(entity) {
  const namedEntities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }

  if (entity in namedEntities) {
    return namedEntities[entity]
  }

  if (entity.startsWith('#x')) {
    const codePoint = Number.parseInt(entity.slice(2), 16)
    return Number.isNaN(codePoint) ? `&${entity};` : String.fromCodePoint(codePoint)
  }

  if (entity.startsWith('#')) {
    const codePoint = Number.parseInt(entity.slice(1), 10)
    return Number.isNaN(codePoint) ? `&${entity};` : String.fromCodePoint(codePoint)
  }

  return `&${entity};`
}

async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export function normalizeTwitterHandle(value) {
  const normalizedValue = String(value).trim().replace(/^@+/, '').toLowerCase()

  if (!/^[a-z0-9_]{1,15}$/.test(normalizedValue)) {
    throw new Error('Twitter handle is invalid.')
  }

  return normalizedValue
}

export function normalizeTwitterTweetUrl(value) {
  let url

  try {
    url = new URL(value)
  } catch {
    throw new Error('Tweet URL is invalid.')
  }

  const hostname = url.hostname.toLowerCase()

  if (!SUPPORTED_TWITTER_HOSTS.has(hostname)) {
    throw new Error('Tweet URL must point to x.com or twitter.com.')
  }

  const segments = url.pathname.split('/').filter(Boolean)

  if (
    segments.length >= 3 &&
    segments[1] === 'status' &&
    /^\d+$/.test(segments[2])
  ) {
    return `https://twitter.com/${normalizeTwitterHandle(segments[0])}/status/${segments[2]}`
  }

  if (
    segments.length >= 4 &&
    segments[0] === 'i' &&
    segments[1] === 'web' &&
    segments[2] === 'status' &&
    /^\d+$/.test(segments[3])
  ) {
    return `https://twitter.com/i/web/status/${segments[3]}`
  }

  throw new Error('Tweet URL must point to a specific post.')
}

export function extractTwitterTweetId(tweetUrl) {
  const url = new URL(tweetUrl)
  const segments = url.pathname.split('/').filter(Boolean)
  const statusSegment =
    segments[1] === 'status'
      ? segments[2]
      : segments[0] === 'i' && segments[1] === 'web' && segments[2] === 'status'
        ? segments[3]
        : null

  if (!statusSegment || !/^\d+$/.test(statusSegment)) {
    throw new Error('Tweet URL is invalid.')
  }

  return statusSegment
}

export function extractTwitterHandleFromAuthorUrl(authorUrl) {
  let url

  try {
    url = new URL(authorUrl)
  } catch {
    throw new Error('Twitter author URL is invalid.')
  }

  const segments = url.pathname.split('/').filter(Boolean)

  if (segments.length === 0) {
    throw new Error('Twitter author URL is invalid.')
  }

  return normalizeTwitterHandle(segments[0])
}

export function extractTwitterTextFromOEmbedHtml(html) {
  if (typeof html !== 'string' || html.trim().length === 0) {
    throw new Error('Twitter oEmbed HTML is invalid.')
  }

  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&([a-zA-Z0-9#]+);/g, (_, entity) => decodeHtmlEntity(entity))
    .replace(/\s+/g, ' ')
    .trim()
}

export async function fetchTwitterProofTweet(
  {
    tweetUrl,
  },
  fetchImpl = fetch,
) {
  const normalizedTweetUrl = normalizeTwitterTweetUrl(tweetUrl)
  const oEmbedUrl = new URL(TWITTER_OEMBED_URL)

  oEmbedUrl.search = new URLSearchParams({
    dnt: 'true',
    omit_script: '1',
    url: normalizedTweetUrl,
  }).toString()

  const response = await fetchImpl(oEmbedUrl.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'quests-dashboard',
    },
  })
  const body = await readJson(response)

  if (!response.ok) {
    const detail =
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : 'Twitter oEmbed request failed.'

    throw new TwitterApiError(detail, response.status >= 500 ? 502 : 400)
  }

  if (
    !body ||
    typeof body !== 'object' ||
    typeof body.author_url !== 'string' ||
    typeof body.html !== 'string'
  ) {
    throw new TwitterApiError('Twitter oEmbed response is malformed.', 502)
  }

  return {
    displayName:
      'author_name' in body && (body.author_name === null || typeof body.author_name === 'string')
        ? body.author_name
        : null,
    normalizedTweetUrl,
    text: extractTwitterTextFromOEmbedHtml(body.html),
    tweetId: extractTwitterTweetId(normalizedTweetUrl),
    username: extractTwitterHandleFromAuthorUrl(body.author_url),
  }
}
