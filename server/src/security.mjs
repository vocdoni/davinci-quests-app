import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

const CHALLENGE_TTL_SECONDS = 300

function normalizeTimestampToSecond(now) {
  return Math.floor(now / 1000) * 1000
}

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

function parseSignedToken(token, malformedMessage) {
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

export function createSignedToken(payload, secret) {
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

export function verifySignedToken(token, secret, malformedMessage) {
  const { encodedHeader, encodedPayload, encodedSignature, signingInput } =
    parseSignedToken(token, malformedMessage)
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

export function createWalletChallengeToken(
  {
    address,
    expiresAt,
    issuedAt,
    nonce,
    origin,
  },
  secret,
) {
  return createSignedToken(
    {
      address,
      exp: Math.floor(expiresAt / 1000),
      iat: Math.floor(issuedAt / 1000),
      nonce,
      origin,
    },
    secret,
  )
}

export function verifyWalletChallengeToken(token, secret, now = Date.now()) {
  const payload = verifySignedToken(
    token,
    secret,
    'Wallet challenge is invalid.',
  )

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.address !== 'string' ||
    typeof payload.exp !== 'number' ||
    typeof payload.iat !== 'number' ||
    typeof payload.nonce !== 'string' ||
    typeof payload.origin !== 'string'
  ) {
    throw new Error('Wallet challenge is invalid.')
  }

  if (payload.exp <= Math.floor(now / 1000)) {
    throw new Error('Wallet challenge has expired.')
  }

  return payload
}

export function buildWalletSignInMessage(address, origin, nonce, now = Date.now()) {
  const normalizedNow = normalizeTimestampToSecond(now)
  const issuedAt = new Date(normalizedNow).toISOString()
  const expirationTime = new Date(
    normalizedNow + CHALLENGE_TTL_SECONDS * 1000,
  ).toISOString()

  return [
    'Quests Dashboard wallet sign-in',
    '',
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Origin: ${origin}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expirationTime}`,
  ].join('\n')
}

export function createAppSessionToken(
  {
    walletAddress,
  },
  secret,
  ttlSeconds,
  now = Date.now(),
) {
  const issuedAt = Math.floor(now / 1000)

  return createSignedToken(
    {
      exp: issuedAt + ttlSeconds,
      iat: issuedAt,
      wallet_address: walletAddress,
    },
    secret,
  )
}

export function verifyAppSessionToken(token, secret, now = Date.now()) {
  const payload = verifySignedToken(token, secret, 'App session is invalid.')

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.exp !== 'number' ||
    typeof payload.iat !== 'number' ||
    typeof payload.wallet_address !== 'string'
  ) {
    throw new Error('App session is invalid.')
  }

  if (payload.exp <= Math.floor(now / 1000)) {
    throw new Error('App session has expired.')
  }

  return {
    walletAddress: payload.wallet_address,
  }
}

export function createDiscordStateToken(
  {
    walletAddress,
  },
  secret,
  now = Date.now(),
) {
  const issuedAt = Math.floor(now / 1000)

  return createSignedToken(
    {
      exp: issuedAt + CHALLENGE_TTL_SECONDS,
      iat: issuedAt,
      provider: 'discord',
      wallet_address: walletAddress,
    },
    secret,
  )
}

export function verifyDiscordStateToken(token, secret, now = Date.now()) {
  const payload = verifySignedToken(token, secret, 'Discord state is invalid.')

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.exp !== 'number' ||
    typeof payload.iat !== 'number' ||
    payload.provider !== 'discord' ||
    typeof payload.wallet_address !== 'string'
  ) {
    throw new Error('Discord state is invalid.')
  }

  if (payload.exp <= Math.floor(now / 1000)) {
    throw new Error('Discord state has expired.')
  }

  return {
    walletAddress: payload.wallet_address,
  }
}

export function createGitHubStateToken(
  {
    walletAddress,
  },
  secret,
  now = Date.now(),
) {
  const issuedAt = Math.floor(now / 1000)

  return createSignedToken(
    {
      exp: issuedAt + CHALLENGE_TTL_SECONDS,
      iat: issuedAt,
      provider: 'github',
      wallet_address: walletAddress,
    },
    secret,
  )
}

export function verifyGitHubStateToken(token, secret, now = Date.now()) {
  const payload = verifySignedToken(token, secret, 'GitHub state is invalid.')

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.exp !== 'number' ||
    typeof payload.iat !== 'number' ||
    payload.provider !== 'github' ||
    typeof payload.wallet_address !== 'string'
  ) {
    throw new Error('GitHub state is invalid.')
  }

  if (payload.exp <= Math.floor(now / 1000)) {
    throw new Error('GitHub state has expired.')
  }

  return {
    walletAddress: payload.wallet_address,
  }
}

function deriveEncryptionKey(secret) {
  return createHash('sha256').update(secret).digest()
}

export function encryptSecret(value, secret) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveEncryptionKey(secret), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    encodeBase64Url(iv),
    encodeBase64Url(authTag),
    encodeBase64Url(encrypted),
  ].join('.')
}

export function decryptSecret(value, secret) {
  const [encodedIv, encodedAuthTag, encodedCiphertext, ...extraSegments] =
    value.split('.')

  if (
    extraSegments.length > 0 ||
    !encodedIv ||
    !encodedAuthTag ||
    !encodedCiphertext
  ) {
    throw new Error('Encrypted secret is malformed.')
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveEncryptionKey(secret),
    decodeBase64Url(encodedIv),
  )

  decipher.setAuthTag(decodeBase64Url(encodedAuthTag))

  const decrypted = Buffer.concat([
    decipher.update(decodeBase64Url(encodedCiphertext)),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}
