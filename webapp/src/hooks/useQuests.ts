import { useQuery } from '@tanstack/react-query'
import { requestJson } from '../lib/api'
import type { QuestCatalog } from '../lib/quests'

type UseQuestsParameters = {
  apiBaseUrl: string
}

export function useQuests({ apiBaseUrl }: UseQuestsParameters) {
  return useQuery({
    queryFn: () => requestJson<QuestCatalog>(apiBaseUrl, '/api/quests'),
    queryKey: ['quest-catalog', apiBaseUrl],
    retry: false,
    staleTime: Infinity,
  })
}
