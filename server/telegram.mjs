import {
  createHash,
  createHmac,
  createPublicKey,
  createVerify,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

export const TELEGRAM_OIDC_ISSUER = 'https://oauth.telegram.org'
export const TELEGRAM_OIDC_DISCOVERY_URL = `${TELEGRAM_OIDC_ISSUER}/.well-known/openid-configuration`
export const TELEGRAM_APP_TOKEN_ISSUER = 'quests-dashboard-telegram-api'

const STATE_TOKEN_TTL_SECONDS = 300
const APP_TOKEN_TTL_SECONDS = 3600

function encodeBase64Url(value) {
  const bufferValue = Buffer.isBuffer(value) ? value : Buffer.from(value)

  return bufferValue
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function decodeBase64Url(value) {
  const normalizedValue = value.replace(/-/g, '+').replace(/_/g, '/')
  const paddingLength = (4 - (normalizedValue.length % 4)) % 4
  const paddedValue = normalizedValue + '='.repeat(paddingLength)

  return Buffer.from(paddedValue, 'base64')
}

function parseJsonBuffer(bufferValue, message) {
  try {
    return JSON.parse(bufferValue.toString('utf8'))
  } catch {
    throw new Error(message)
  }
}

function parseJwtSegments(token, malformedMessage) {
  const [encodedHeader, encodedPayload, encodedSignature, ...extraSegments] =
    token.split('.')

  if (
    extraSegments.length > 0 ||
    !encodedHeader ||
    !encodedPayload ||
    !encodedSignature
  ) {
    throw new Error(malformedMessage)
  }

  return {
    encodedHeader,
    encodedPayload,
    encodedSignature,
    signingInput: `${encodedHeader}.${encodedPayload}`,
  }
}

function createSignedToken(payload, secret) {
  const encodedHeader = encodeBase64Url(
    JSON.stringify({
      alg: 'HS256',
      typ: 'JWT',
    }),
  )
  const encodedPayload = encodeBase64Url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const encodedSignature = encodeBase64Url(
    createHmac('sha256', secret).update(signingInput).digest(),
  )

  return `${signingInput}.${encodedSignature}`
}

function verifySignedToken(token, secret, malformedMessage) {
  const { encodedHeader, encodedPayload, encodedSignature, signingInput } =
    parseJwtSegments(token, malformedMessage)
  const header = parseJsonBuffer(
    decodeBase64Url(encodedHeader),
    malformedMessage,
  )

  if (header.alg !== 'HS256') {
    throw new Error(malformedMessage)
  }

  const expectedSignature = createHmac('sha256', secret)
    .update(signingInput)
    .digest()
  const actualSignature = decodeBase64Url(encodedSignature)

  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    throw new Error(malformedMessage)
  }

  return parseJsonBuffer(decodeBase64Url(encodedPayload), malformedMessage)
}

export function createRandomToken(size = 32) {
  return encodeBase64Url(randomBytes(size))
}

export function createPkceChallenge(codeVerifier) {
  return encodeBase64Url(createHash('sha256').update(codeVerifier).digest())
}

export function buildTelegramAuthorizationUrl(
  {
    authorizationEndpoint,
    clientId,
    redirectUri,
  },
  {
    codeChallenge,
    nonce,
    state,
  },
) {
  const url = new URL(authorizationEndpoint)

  url.search = new URLSearchParams({
    client_id: clientId,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    nonce,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile',
    state,
  }).toString()

  return url.toString()
}

export async function fetchTelegramOidcConfiguration(fetchImpl = fetch) {
  const response = await fetchImpl(TELEGRAM_OIDC_DISCOVERY_URL)

  if (!response.ok) {
    throw new Error('Failed to load Telegram OpenID configuration.')
  }

  const body = await response.json()

  if (
    !body ||
    typeof body !== 'object' ||
    typeof body.authorization_endpoint !== 'string' ||
    typeof body.issuer !== 'string' ||
    typeof body.jwks_uri !== 'string' ||
    typeof body.token_endpoint !== 'string'
  ) {
    throw new Error('Telegram OpenID configuration is malformed.')
  }

  return {
    authorizationEndpoint: body.authorization_endpoint,
    issuer: body.issuer,
    jwksUri: body.jwks_uri,
    tokenEndpoint: body.token_endpoint,
  }
}

export function createTelegramStateToken(
  {
    codeVerifier,
    nonce,
    walletAddress,
  },
  secret,
  now = Date.now(),
) {
  const issuedAt = Math.floor(now / 1000)

  return createSignedToken(
    {
      code_verifier: codeVerifier,
      exp: issuedAt + STATE_TOKEN_TTL_SECONDS,
      iat: issuedAt,
      nonce,
      ...(walletAddress ? { wallet_address: walletAddress } : {}),
    },
    secret,
  )
}

export function verifyTelegramStateToken(token, secret, now = Date.now()) {
  const payload = verifySignedToken(
    token,
    secret,
    'Telegram auth state is invalid.',
  )

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.code_verifier !== 'string' ||
    typeof payload.exp !== 'number' ||
    typeof payload.iat !== 'number' ||
    typeof payload.nonce !== 'string'
  ) {
    throw new Error('Telegram auth state is invalid.')
  }

  if (payload.exp <= Math.floor(now / 1000)) {
    throw new Error('Telegram auth state has expired.')
  }

  return {
    codeVerifier: payload.code_verifier,
    nonce: payload.nonce,
    walletAddress:
      typeof payload.wallet_address === 'string' ? payload.wallet_address : null,
  }
}

export async function exchangeTelegramAuthorizationCode(
  {
    clientId,
    clientSecret,
    code,
    codeVerifier,
    redirectUri,
    tokenEndpoint,
  },
  fetchImpl = fetch,
) {
  const response = await fetchImpl(tokenEndpoint, {
    body: new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      client_id: clientId,
    }).toString(),
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'error_description' in body
        ? body.error_description
        : 'Telegram token exchange failed.'

    throw new Error(typeof detail === 'string' ? detail : 'Telegram token exchange failed.')
  }

  if (!body || typeof body !== 'object' || typeof body.id_token !== 'string') {
    throw new Error('Telegram token response is missing id_token.')
  }

  return {
    idToken: body.id_token,
  }
}

async function fetchTelegramJwks(jwksUri, fetchImpl = fetch) {
  const response = await fetchImpl(jwksUri)

  if (!response.ok) {
    throw new Error('Failed to load Telegram signing keys.')
  }

  const body = await response.json()

  if (
    !body ||
    typeof body !== 'object' ||
    !Array.isArray(body.keys)
  ) {
    throw new Error('Telegram signing keys are malformed.')
  }

  return body.keys
}

function verifyJwtSignature(idToken, jwk) {
  const { encodedHeader, encodedPayload, encodedSignature, signingInput } =
    parseJwtSegments(idToken, 'Telegram id_token is malformed.')
  const publicKey = createPublicKey({
    format: 'jwk',
    key: jwk,
  })
  const verifier = createVerify('RSA-SHA256')

  verifier.update(signingInput)
  verifier.end()

  const isValid = verifier.verify(publicKey, decodeBase64Url(encodedSignature))

  if (!isValid) {
    throw new Error('Telegram id_token signature is invalid.')
  }

  const header = parseJsonBuffer(
    decodeBase64Url(encodedHeader),
    'Telegram id_token header is malformed.',
  )
  const payload = parseJsonBuffer(
    decodeBase64Url(encodedPayload),
    'Telegram id_token payload is malformed.',
  )

  return {
    header,
    payload,
  }
}

function hasExpectedAudience(audienceClaim, expectedAudience) {
  if (typeof audienceClaim === 'string') {
    return audienceClaim === expectedAudience
  }

  return Array.isArray(audienceClaim) && audienceClaim.includes(expectedAudience)
}

export async function verifyTelegramIdToken(
  {
    clientId,
    expectedIssuer,
    expectedNonce,
    idToken,
    jwksUri,
  },
  fetchImpl = fetch,
  now = Date.now(),
) {
  const { encodedHeader } = parseJwtSegments(
    idToken,
    'Telegram id_token is malformed.',
  )
  const header = parseJsonBuffer(
    decodeBase64Url(encodedHeader),
    'Telegram id_token header is malformed.',
  )

  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new Error('Telegram id_token uses an unsupported signing algorithm.')
  }

  const jwks = await fetchTelegramJwks(jwksUri, fetchImpl)
  const jwk = jwks.find(
    (candidate) =>
      candidate &&
      typeof candidate === 'object' &&
      candidate.kid === header.kid &&
      candidate.kty === 'RSA',
  )

  if (!jwk) {
    throw new Error('Telegram signing key was not found.')
  }

  const { payload } = verifyJwtSignature(idToken, jwk)

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.exp !== 'number' ||
    typeof payload.iat !== 'number' ||
    typeof payload.iss !== 'string' ||
    typeof payload.nonce !== 'string' ||
    (typeof payload.id !== 'number' && typeof payload.id !== 'string')
  ) {
    throw new Error('Telegram id_token is missing required claims.')
  }

  if (payload.iss !== expectedIssuer) {
    throw new Error('Telegram id_token issuer is invalid.')
  }

  if (!hasExpectedAudience(payload.aud, clientId)) {
    throw new Error('Telegram id_token audience is invalid.')
  }

  if (payload.exp <= Math.floor(now / 1000)) {
    throw new Error('Telegram id_token has expired.')
  }

  if (payload.nonce !== expectedNonce) {
    throw new Error('Telegram id_token nonce is invalid.')
  }

  return {
    displayName: typeof payload.name === 'string' ? payload.name : null,
    subject: typeof payload.sub === 'string' ? payload.sub : String(payload.id),
    telegramId: String(payload.id),
    username:
      typeof payload.preferred_username === 'string'
        ? payload.preferred_username
        : null,
  }
}

export function createTelegramAppToken(
  {
    displayName,
    frontendAppUrl,
    subject,
    telegramId,
    username,
  },
  secret,
  now = Date.now(),
) {
  const issuedAt = Math.floor(now / 1000)

  return createSignedToken(
    {
      aud: frontendAppUrl,
      display_name: displayName,
      exp: issuedAt + APP_TOKEN_TTL_SECONDS,
      iat: issuedAt,
      iss: TELEGRAM_APP_TOKEN_ISSUER,
      sub: subject,
      telegram_id: telegramId,
      username,
    },
    secret,
  )
}

export function verifyTelegramAppToken(
  token,
  secret,
  {
    expectedAudience,
  },
  now = Date.now(),
) {
  const payload = verifySignedToken(
    token,
    secret,
    'Telegram app token is invalid.',
  )

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.aud !== 'string' ||
    typeof payload.exp !== 'number' ||
    typeof payload.iat !== 'number' ||
    typeof payload.iss !== 'string' ||
    typeof payload.sub !== 'string' ||
    typeof payload.telegram_id !== 'string'
  ) {
    throw new Error('Telegram app token is invalid.')
  }

  if (payload.iss !== TELEGRAM_APP_TOKEN_ISSUER) {
    throw new Error('Telegram app token issuer is invalid.')
  }

  if (payload.aud !== expectedAudience) {
    throw new Error('Telegram app token audience is invalid.')
  }

  if (payload.exp <= Math.floor(now / 1000)) {
    throw new Error('Telegram app token has expired.')
  }

  return {
    displayName:
      typeof payload.display_name === 'string' ? payload.display_name : null,
    subject: payload.sub,
    telegramId: payload.telegram_id,
    username: typeof payload.username === 'string' ? payload.username : null,
  }
}

export function normalizeChannelUsername(channelUsername) {
  const normalizedChannelUsername = channelUsername.trim().replace(/^@/, '')

  if (!/^[A-Za-z][A-Za-z0-9_]{4,}$/.test(normalizedChannelUsername)) {
    throw new Error(
      'TELEGRAM_CHANNEL_USERNAME must be a valid public Telegram channel username.',
    )
  }

  return `@${normalizedChannelUsername}`
}

export function mapTelegramChatMemberStatus(status) {
  switch (status) {
    case 'administrator':
    case 'creator':
    case 'member':
    case 'restricted':
      return true
    case 'kicked':
    case 'left':
      return false
    default:
      throw new Error('Telegram returned an unknown chat member status.')
  }
}

export async function fetchTelegramChannelMembership(
  {
    botToken,
    channelUsername,
    telegramUserId,
  },
  fetchImpl = fetch,
) {
  const url = new URL(`https://api.telegram.org/bot${botToken}/getChatMember`)

  url.search = new URLSearchParams({
    chat_id: channelUsername,
    user_id: telegramUserId,
  }).toString()

  const response = await fetchImpl(url)
  const body = await response.json().catch(() => null)

  if (!response.ok || !body || typeof body !== 'object' || body.ok !== true) {
    const detail =
      body && typeof body === 'object' && 'description' in body
        ? body.description
        : 'Telegram channel membership lookup failed.'

    throw new Error(
      typeof detail === 'string'
        ? detail
        : 'Telegram channel membership lookup failed.',
    )
  }

  const status =
    body.result &&
    typeof body.result === 'object' &&
    'status' in body.result &&
    typeof body.result.status === 'string'
      ? body.result.status
      : null

  if (!status) {
    throw new Error('Telegram channel membership lookup returned no status.')
  }

  return {
    isInTargetChannel: mapTelegramChatMemberStatus(status),
  }
}

export function buildTelegramFrontendRedirect(frontendAppUrl, fragmentParams) {
  const redirectUrl = new URL(frontendAppUrl)

  redirectUrl.hash = new URLSearchParams(fragmentParams).toString()

  return redirectUrl.toString()
}
