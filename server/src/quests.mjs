import { existsSync, readFileSync } from 'node:fs'
import { normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const QUEST_ROLES = ['builders', 'supporters']
const DEFAULT_QUESTS_FILE_URL = new URL('../quests.json', import.meta.url)
const DEFAULT_QUESTS_FILE_PATH = fileURLToPath(DEFAULT_QUESTS_FILE_URL)
const LEGACY_DEFAULT_QUESTS_FILE_PATH = normalize('./src/quests.json')

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

  if (quest.disabled !== undefined && typeof quest.disabled !== 'boolean') {
    throw new Error(`Quest ${quest.id} in ${role} disabled must be a boolean.`)
  }

  let callToAction = null
  let connectButton = null

  if (quest.callToAction !== undefined) {
    if (
      !quest.callToAction ||
      typeof quest.callToAction !== 'object' ||
      Array.isArray(quest.callToAction)
    ) {
      throw new Error(`Quest ${quest.id} in ${role} must define a valid callToAction object.`)
    }

    if (
      typeof quest.callToAction.title !== 'string' ||
      quest.callToAction.title.trim().length === 0
    ) {
      throw new Error(`Quest ${quest.id} in ${role} callToAction must have a title.`)
    }

    if (
      typeof quest.callToAction.url !== 'string' ||
      quest.callToAction.url.trim().length === 0
    ) {
      throw new Error(`Quest ${quest.id} in ${role} callToAction must have a url.`)
    }

    try {
      const normalizedUrl = quest.callToAction.url.trim()

      const normalizedCallToAction = {
        help:
          typeof quest.callToAction.help === 'string' && quest.callToAction.help.trim().length > 0
            ? quest.callToAction.help.trim()
            : null,
        title: quest.callToAction.title.trim(),
        url: normalizedUrl.startsWith('/')
          ? normalizedUrl
          : new URL(normalizedUrl).toString(),
      }

      if (
        typeof quest.callToAction.icon === 'string' &&
        quest.callToAction.icon.trim().length > 0
      ) {
        normalizedCallToAction.icon = quest.callToAction.icon.trim()
      }

      callToAction = normalizedCallToAction
    } catch {
      throw new Error(`Quest ${quest.id} in ${role} callToAction must have a valid url.`)
    }
  }

  if (quest.connectButton !== undefined) {
    if (
      !quest.connectButton ||
      typeof quest.connectButton !== 'object' ||
      Array.isArray(quest.connectButton)
    ) {
      throw new Error(`Quest ${quest.id} in ${role} must define a valid connectButton object.`)
    }

    if (
      typeof quest.connectButton.title !== 'string' ||
      quest.connectButton.title.trim().length === 0
    ) {
      throw new Error(`Quest ${quest.id} in ${role} connectButton must have a title.`)
    }

    if (
      typeof quest.connectButton.url !== 'string' ||
      quest.connectButton.url.trim().length === 0
    ) {
      throw new Error(`Quest ${quest.id} in ${role} connectButton must have a url.`)
    }

    try {
      const normalizedUrl = quest.connectButton.url.trim()

      const normalizedConnectButton = {
        title: quest.connectButton.title.trim(),
        url: normalizedUrl.startsWith('/')
          ? normalizedUrl
          : new URL(normalizedUrl).toString(),
      }

      if (
        typeof quest.connectButton.icon === 'string' &&
        quest.connectButton.icon.trim().length > 0
      ) {
        normalizedConnectButton.icon = quest.connectButton.icon.trim()
      }

      connectButton = normalizedConnectButton
    } catch {
      throw new Error(`Quest ${quest.id} in ${role} connectButton must have a valid url.`)
    }
  }

  const normalizedQuest = {
    achievement: quest.achievement.trim(),
    description: quest.description.trim(),
    id: quest.id,
    points: quest.points,
    title: quest.title.trim(),
  }

  if (quest.disabled === true) {
    normalizedQuest.disabled = true
  }

  if (callToAction) {
    normalizedQuest.callToAction = callToAction
  }

  if (connectButton) {
    normalizedQuest.connectButton = connectButton
  }

  return normalizedQuest
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

function resolveQuestCatalogFilePath(filePath) {
  if (!filePath) {
    return DEFAULT_QUESTS_FILE_PATH
  }

  const resolvedPath = resolve(process.cwd(), filePath)

  if (existsSync(resolvedPath)) {
    return resolvedPath
  }

  if (normalize(filePath) === LEGACY_DEFAULT_QUESTS_FILE_PATH) {
    return DEFAULT_QUESTS_FILE_PATH
  }

  return resolvedPath
}

export function resolveQuestCatalogPath(filePath = null) {
  return resolveQuestCatalogFilePath(filePath)
}

export function loadQuestCatalog(filePath = null) {
  const fileContents = readFileSync(resolveQuestCatalogFilePath(filePath), 'utf8')
  const parsed = JSON.parse(fileContents)

  return normalizeQuestCatalog(parsed)
}
