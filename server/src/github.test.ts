// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import {
  buildGitHubAuthorizationUrl,
  fetchGitHubUserStats,
} from './github.mjs'

function createJsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    json: async () => body,
    ok,
    status,
  }
}

function createStatusResponse(status) {
  return {
    json: async () => null,
    ok: status >= 200 && status < 300,
    status,
  }
}

describe('github backend helpers', () => {
  it('builds the GitHub authorization URL', () => {
    const url = new URL(
      buildGitHubAuthorizationUrl(
        {
          clientId: 'github-client-id',
          redirectUri: 'https://api.example.org/api/connections/github/callback',
        },
        'github-state-token',
      ),
    )

    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('github-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.example.org/api/connections/github/callback',
    )
    expect(url.searchParams.get('scope')).toBe('read:user')
    expect(url.searchParams.get('state')).toBe('github-state-token')
  })

  it('collects GitHub account age, non-fork repos, stars, and org follow state', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url === 'https://api.github.com/user') {
        return createJsonResponse({
          created_at: '2023-01-01T00:00:00.000Z',
          id: 123456,
          login: 'questmaster',
          name: 'Quest Master',
        })
      }

      if (url.includes('/users/questmaster/repos?') && url.includes('page=1')) {
        return createJsonResponse(
          Array.from({ length: 100 }, (_, index) => ({
            fork: index < 30,
          })),
        )
      }

      if (url.includes('/users/questmaster/repos?') && url.includes('page=2')) {
        return createJsonResponse([
          { fork: false },
          { fork: true },
          { fork: false },
        ])
      }

      if (url === 'https://api.github.com/user/starred/vocdoni/davinciNode') {
        return createStatusResponse(204)
      }

      if (url === 'https://api.github.com/user/starred/vocdoni/davinciSDK') {
        return createStatusResponse(404)
      }

      if (url === 'https://api.github.com/user/following/vocdoni') {
        return createStatusResponse(204)
      }

      throw new Error(`Unexpected GitHub request in test: ${url}`)
    })

    const stats = await fetchGitHubUserStats(
      {
        accessToken: 'github-access-token',
        targetOrganization: 'vocdoni',
        targetRepositories: [
          {
            fullName: 'vocdoni/davinciNode',
            name: 'davinciNode',
            owner: 'vocdoni',
          },
          {
            fullName: 'vocdoni/davinciSDK',
            name: 'davinciSDK',
            owner: 'vocdoni',
          },
        ],
      },
      fetchImpl,
      new Date('2026-03-24T12:00:00.000Z').getTime(),
    )

    expect(stats).toEqual({
      accountCreatedAt: '2023-01-01T00:00:00.000Z',
      displayName: 'Quest Master',
      isFollowingTargetOrganization: true,
      isOlderThanOneYear: true,
      publicNonForkRepositoryCount: 72,
      targetOrganization: 'vocdoni',
      targetRepositories: [
        {
          fullName: 'vocdoni/davinciNode',
          isStarred: true,
        },
        {
          fullName: 'vocdoni/davinciSDK',
          isStarred: false,
        },
      ],
      userId: '123456',
      username: 'questmaster',
    })
    expect(fetchImpl).toHaveBeenCalledWith('https://api.github.com/user', expect.any(Object))
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/users/questmaster/repos?'),
      expect.any(Object),
    )
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/user/starred/vocdoni/davinciNode',
      expect.any(Object),
    )
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/user/starred/vocdoni/davinciSDK',
      expect.any(Object),
    )
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/user/following/vocdoni',
      expect.any(Object),
    )
  })
})
