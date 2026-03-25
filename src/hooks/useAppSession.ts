import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getAddress, isAddress, type Address } from 'viem'
import { ApiError, buildApiUrl, requestJson, requestVoid } from '../lib/api'

export type ProviderName = 'discord' | 'github' | 'telegram' | 'twitter'

type DiscordIdentity = {
  connected: boolean
  displayName: string | null
  error: string | null
  stats: {
    isInTargetServer: boolean | null
  }
  status: string
  userId: string | null
  username: string | null
}

type GitHubIdentity = {
  connected: boolean
  displayName: string | null
  error: string | null
  stats: {
    isFollowingTargetOrganization: boolean | null
    isOlderThanOneYear: boolean | null
    publicNonForkRepositoryCount: number | null
    targetOrganization: string | null
    targetRepositories: Array<{
      fullName: string
      isStarred: boolean | null
    }>
  }
  status: string
  userId: string | null
  username: string | null
}

type TelegramIdentity = {
  connected: boolean
  displayName: string | null
  error: string | null
  stats: {
    isInTargetChannel: boolean | null
  }
  status: string
  userId: string | null
  username: string | null
}

type TwitterIdentity = {
  connected: boolean
  displayName: string | null
  error: string | null
  stats: Record<string, never>
  status: string
  userId: string | null
  username: string | null
}

export type AppProfile = {
  identities: {
    discord: DiscordIdentity
    github: GitHubIdentity
    telegram: TelegramIdentity
    twitter: TwitterIdentity
  }
  onchain: {
    error: string | null
    numberOfProcesses: number
    totalVotes: string
  }
  wallet: {
    address: string
  }
}

type LinkFeedback = {
  error: string | null
  provider: ProviderName
  status: 'error' | 'success'
}

type UseAppSessionParameters = {
  apiBaseUrl: string
  enabled: boolean
  expectedWalletAddress?: Address
}

function normalizeAddress(address?: string | null) {
  if (!address || !isAddress(address)) {
    return null
  }

  return getAddress(address)
}

function clearHash() {
  if (typeof window === 'undefined') {
    return
  }

  window.history.replaceState(
    null,
    document.title,
    `${window.location.pathname}${window.location.search}`,
  )
}

export function parseLinkFeedback(hash: string): LinkFeedback | null {
  const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash

  if (!normalizedHash) {
    return null
  }

  const params = new URLSearchParams(normalizedHash)
  const provider = params.get('link_provider')
  const status = params.get('link_status')

  if (
    (provider !== 'discord' && provider !== 'github' && provider !== 'telegram') ||
    (status !== 'error' && status !== 'success')
  ) {
    return null
  }

  return {
    error: params.get('link_error'),
    provider,
    status,
  }
}

export function useAppSession({
  apiBaseUrl,
  enabled,
  expectedWalletAddress,
}: UseAppSessionParameters) {
  const queryClient = useQueryClient()
  const [linkFeedback, setLinkFeedback] = useState<LinkFeedback | null>(() =>
    typeof window === 'undefined' ? null : parseLinkFeedback(window.location.hash),
  )
  const expectedAddress = normalizeAddress(expectedWalletAddress ?? null)
  const profileQuery = useQuery({
    enabled,
    queryFn: async () => {
      try {
        return await requestJson<AppProfile>(apiBaseUrl, '/api/me')
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return null
        }

        throw error
      }
    },
    queryKey: ['app-profile', apiBaseUrl],
    retry: false,
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const nextFeedback = parseLinkFeedback(window.location.hash)

    if (!nextFeedback) {
      return
    }

    setLinkFeedback(nextFeedback)
    clearHash()
  }, [])

  const profile = profileQuery.data ?? null
  const sessionWalletAddress = normalizeAddress(profile?.wallet.address ?? null)
  const isAuthenticated = Boolean(
    expectedAddress && sessionWalletAddress && expectedAddress === sessionWalletAddress,
  )

  const requestWalletChallenge = (address: Address) =>
    requestJson<{ message: string }>(apiBaseUrl, '/api/auth/wallet/challenge', {
      body: JSON.stringify({ address }),
      method: 'POST',
    })

  const verifyWallet = async (address: Address, signature: string) => {
    await requestJson<AppProfile>(apiBaseUrl, '/api/auth/wallet/verify', {
      body: JSON.stringify({ address, signature }),
      method: 'POST',
    })
    await queryClient.invalidateQueries({
      queryKey: ['app-profile', apiBaseUrl],
    })
  }

  const logout = async () => {
    try {
      await requestVoid(apiBaseUrl, '/api/auth/logout', {
        method: 'POST',
      })
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        throw error
      }
    } finally {
      queryClient.setQueryData(['app-profile', apiBaseUrl], null)
    }
  }

  const unlinkProvider = async (provider: ProviderName) => {
    await requestVoid(apiBaseUrl, `/api/connections/${provider}`, {
      method: 'DELETE',
    })
    await queryClient.invalidateQueries({
      queryKey: ['app-profile', apiBaseUrl],
    })
  }

  const startProviderConnection = (provider: ProviderName) => {
    if (typeof window === 'undefined') {
      return
    }

    window.location.assign(buildApiUrl(apiBaseUrl, `/api/connections/${provider}/start`))
  }

  const requestTwitterCode = () =>
    requestJson<{ code: string; expiresAt: string }>(
      apiBaseUrl,
      '/api/connections/twitter/code',
      {
        method: 'POST',
      },
    )

  const verifyTwitterTweet = async (tweetUrl: string) => {
    await requestVoid(apiBaseUrl, '/api/connections/twitter/verify', {
      body: JSON.stringify({ tweetUrl }),
      method: 'POST',
    })
    await queryClient.invalidateQueries({
      queryKey: ['app-profile', apiBaseUrl],
    })
  }

  return {
    clearLinkFeedback: () => {
      setLinkFeedback(null)
    },
    error: profileQuery.error instanceof Error ? profileQuery.error.message : null,
    isAuthenticated,
    isLoading: enabled ? profileQuery.isPending || profileQuery.isFetching : false,
    isReady: !enabled || profileQuery.isSuccess || profileQuery.isError,
    linkFeedback,
    logout,
    profile,
    refetchProfile: profileQuery.refetch,
    requestTwitterCode,
    requestWalletChallenge,
    sessionWalletAddress,
    startProviderConnection,
    unlinkProvider,
    verifyTwitterTweet,
    verifyWallet,
  }
}
