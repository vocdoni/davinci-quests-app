import { useQuery } from '@tanstack/react-query'
import { requestJson } from '../lib/api'

export type LeaderboardRow = {
  buildersPoints: number
  displayName: string
  ensName: string | null
  lastComputedAt: string | null
  rank: number
  supportersPoints: number
  totalPoints: number
  walletAddress: string
}

type UseLeaderboardParameters = {
  apiBaseUrl: string
  limit?: number
}

export function useLeaderboard({
  apiBaseUrl,
  limit = 100,
}: UseLeaderboardParameters) {
  return useQuery({
    queryFn: async () =>
      requestJson<{ rows: LeaderboardRow[] }>(
        apiBaseUrl,
        `/api/leaderboard?limit=${limit}`,
      ),
    queryKey: ['leaderboard', apiBaseUrl, limit],
    retry: false,
    staleTime: 60_000,
  })
}
