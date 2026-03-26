const GITHUB_API_BASE_URL = 'https://api.github.com'
const GITHUB_API_VERSION = '2022-11-28'
const GITHUB_OAUTH_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_OAUTH_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000

export const GITHUB_OAUTH_SCOPES = ['read:user']

export class GitHubApiError extends Error {
  status

  constructor(message, status) {
    super(message)
    this.name = 'GitHubApiError'
    this.status = status
  }
}

function getGitHubHeaders(accessToken) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'quests-dashboard',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  }
}

function isOlderThanOneYear(accountCreatedAt, now) {
  return now - accountCreatedAt.getTime() > ONE_YEAR_MS
}

function parseGitHubTokenResponse(body) {
  if (
    !body ||
    typeof body !== 'object' ||
    typeof body.access_token !== 'string' ||
    typeof body.token_type !== 'string'
  ) {
    throw new Error('GitHub token response is malformed.')
  }

  return {
    accessToken: body.access_token,
    scope: typeof body.scope === 'string' ? body.scope : '',
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

async function fetchGitHubResource(url, accessToken, message, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: getGitHubHeaders(accessToken),
  })

  if (!response.ok) {
    const body = await readJson(response)
    const detail =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : message

    throw new GitHubApiError(detail, response.status)
  }

  return response.json()
}

async function countPublicNonForkRepositories(username, accessToken, fetchImpl = fetch) {
  let page = 1
  let total = 0

  while (true) {
    const url = new URL(
      `${GITHUB_API_BASE_URL}/users/${encodeURIComponent(username)}/repos`,
    )

    url.search = new URLSearchParams({
      page: String(page),
      per_page: '100',
      type: 'owner',
    }).toString()

    const repositories = await fetchGitHubResource(
      url.toString(),
      accessToken,
      'Failed to load GitHub repositories.',
      fetchImpl,
    )

    if (!Array.isArray(repositories)) {
      throw new Error('GitHub repositories response is malformed.')
    }

    total += repositories.filter(
      (repository) =>
        repository &&
        typeof repository === 'object' &&
        'fork' in repository &&
        repository.fork === false,
    ).length

    if (repositories.length < 100) {
      return total
    }

    page += 1
  }
}

async function checkGitHubBooleanState(
  url,
  accessToken,
  message,
  fetchImpl = fetch,
) {
  const response = await fetchImpl(url, {
    headers: getGitHubHeaders(accessToken),
  })

  if (response.status === 204) {
    return true
  }

  if (response.status === 404) {
    return false
  }

  const body = await readJson(response)
  const detail =
    body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
      ? body.message
      : message

  throw new GitHubApiError(detail, response.status)
}

async function checkStarredRepository(repository, accessToken, fetchImpl = fetch) {
  return checkGitHubBooleanState(
    `${GITHUB_API_BASE_URL}/user/starred/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`,
    accessToken,
    `Failed to check whether ${repository.fullName} is starred.`,
    fetchImpl,
  )
}

async function checkFollowedAccount(login, accessToken, fetchImpl = fetch) {
  return checkGitHubBooleanState(
    `${GITHUB_API_BASE_URL}/user/following/${encodeURIComponent(login)}`,
    accessToken,
    `Failed to check whether ${login} is followed.`,
    fetchImpl,
  )
}

export function buildGitHubAuthorizationUrl(config, state) {
  const url = new URL(GITHUB_OAUTH_AUTHORIZE_URL)

  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: GITHUB_OAUTH_SCOPES.join(' '),
    state,
  }).toString()

  return url.toString()
}

export async function exchangeGitHubAuthorizationCode(
  {
    clientId,
    clientSecret,
    code,
    redirectUri,
  },
  fetchImpl = fetch,
) {
  const response = await fetchImpl(GITHUB_OAUTH_TOKEN_URL, {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'quests-dashboard',
    },
    method: 'POST',
  })
  const body = await readJson(response)

  if (!response.ok) {
    const detail =
      body &&
      typeof body === 'object' &&
      'error_description' in body &&
      typeof body.error_description === 'string'
        ? body.error_description
        : 'GitHub token exchange failed.'

    throw new GitHubApiError(detail, response.status)
  }

  return parseGitHubTokenResponse(body)
}

export async function fetchGitHubUserStats(
  {
    accessToken,
    targetOrganization,
    targetRepositories,
  },
  fetchImpl = fetch,
  now = Date.now(),
) {
  const repositoriesToCheck = Array.isArray(targetRepositories) ? targetRepositories : []
  const user = await fetchGitHubResource(
    `${GITHUB_API_BASE_URL}/user`,
    accessToken,
    'Failed to load the GitHub account.',
    fetchImpl,
  )

  const typedUser = user
  const createdAtValue =
    typedUser &&
    typeof typedUser === 'object' &&
    'created_at' in typedUser &&
    typeof typedUser.created_at === 'string'
      ? typedUser.created_at
      : null
  const username =
    typedUser &&
    typeof typedUser === 'object' &&
    'login' in typedUser &&
    typeof typedUser.login === 'string'
      ? typedUser.login
      : null
  const userId =
    typedUser &&
    typeof typedUser === 'object' &&
    'id' in typedUser &&
    (typeof typedUser.id === 'number' || typeof typedUser.id === 'string')
      ? String(typedUser.id)
      : null

  if (!createdAtValue || !username || !userId) {
    throw new Error('GitHub returned an incomplete user profile.')
  }

  const accountCreatedAt = new Date(createdAtValue)

  if (Number.isNaN(accountCreatedAt.getTime())) {
    throw new Error('GitHub returned an invalid account creation timestamp.')
  }

  const [
    publicNonForkRepositoryCount,
    starredRepositories,
    isFollowingTargetOrganization,
  ] = await Promise.all([
    countPublicNonForkRepositories(username, accessToken, fetchImpl),
    Promise.all(
      repositoriesToCheck.map(async (repository) => ({
        fullName: repository.fullName,
        isStarred: await checkStarredRepository(repository, accessToken, fetchImpl),
      })),
    ),
    targetOrganization
      ? checkFollowedAccount(targetOrganization, accessToken, fetchImpl)
      : Promise.resolve(null),
  ])

  return {
    accountCreatedAt: accountCreatedAt.toISOString(),
    displayName:
      typedUser &&
      typeof typedUser === 'object' &&
      'name' in typedUser &&
      (typedUser.name === null || typeof typedUser.name === 'string')
        ? typedUser.name
        : null,
    isFollowingTargetOrganization,
    isOlderThanOneYear: isOlderThanOneYear(accountCreatedAt, now),
    publicNonForkRepositoryCount,
    targetOrganization,
    targetRepositories: starredRepositories,
    userId,
    username,
  }
}
