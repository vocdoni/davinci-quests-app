import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const QUEST_ROLES = ['builders', 'supporters']
const DEFAULT_QUESTS_FILE_URL = new URL('../quests.json', import.meta.url)
const DEFAULT_QUESTS_FILE_PATH = fileURLToPath(DEFAULT_QUESTS_FILE_URL)

function assertQuestRole(role) {
  if (!QUEST_ROLES.includes(role)) {
    throw new Error(`Unsupported quest role "${role}".`)
  }
}

function normalizeQuest(role, quest, index) {
  if (!quest || typeof quest !== 'object' || Array.isArray(quest)) {
    throw new Error(`Quest ${index + 1} in ${role} must be an object.`)
  }

  if (!Number.isInteger(quest.id) || quest.id <= 0) {
    throw new Error(`Quest ${index + 1} in ${role} must have a positive integer id.`)
  }

  if (typeof quest.title !== 'string' || quest.title.trim().length === 0) {
    throw new Error(`Quest ${quest.id} in ${role} must have a title.`)
  }

  if (typeof quest.description !== 'string' || quest.description.trim().length === 0) {
    throw new Error(`Quest ${quest.id} in ${role} must have a description.`)
  }

  if (!Number.isFinite(quest.points) || quest.points < 0) {
    throw new Error(`Quest ${quest.id} in ${role} must have a non-negative points value.`)
  }

  if (typeof quest.achievement !== 'string' || quest.achievement.trim().length === 0) {
    throw new Error(`Quest ${quest.id} in ${role} must define an achievement expression.`)
  }

  return {
    achievement: quest.achievement.trim(),
    description: quest.description.trim(),
    id: quest.id,
    points: quest.points,
    title: quest.title.trim(),
  }
}

function normalizeQuestList(role, value) {
  assertQuestRole(role)

  if (!Array.isArray(value)) {
    throw new Error(`Quest role "${role}" must be an array.`)
  }

  const normalized = value.map((quest, index) => normalizeQuest(role, quest, index))
  const ids = new Set()

  for (const quest of normalized) {
    if (ids.has(quest.id)) {
      throw new Error(`Quest role "${role}" contains a duplicated id ${quest.id}.`)
    }

    ids.add(quest.id)
  }

  return normalized
}

export function normalizeQuestCatalog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Quest catalog must be an object.')
  }

  return {
    builders: normalizeQuestList('builders', value.builders),
    supporters: normalizeQuestList('supporters', value.supporters),
  }
}

function resolveQuestCatalogPath(filePath) {
  if (!filePath) {
    return DEFAULT_QUESTS_FILE_PATH
  }

  return resolve(process.cwd(), filePath)
}

export function loadQuestCatalog(filePath = null) {
  const fileContents = readFileSync(resolveQuestCatalogPath(filePath), 'utf8')
  const parsed = JSON.parse(fileContents)

  return normalizeQuestCatalog(parsed)
}
