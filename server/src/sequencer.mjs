import { Wallet } from 'ethers'
import { Worker as NodeWorker } from 'node:worker_threads'

if (typeof globalThis.Worker === 'undefined') {
  globalThis.Worker = NodeWorker
}

export class SequencerApiError extends Error {
  status

  constructor(message, status) {
    super(message)
    this.name = 'SequencerApiError'
    this.status = status
  }
}

export const emptySequencerProcessSnapshot = {
  addressWeight: null,
  error: null,
  hasVoted: null,
  isInCensus: null,
  lastVerifiedAt: null,
  processId: null,
  status: 'unverified',
}

export const emptySequencerSnapshot = {
  addressWeight: null,
  error: null,
  hasVoted: null,
  isConnected: false,
  isInCensus: null,
  lastVerifiedAt: null,
  numOfProcessAsParticipant: 0,
  processId: null,
  processes: [],
  status: 'unverified',
  votesCasted: 0,
}

function normalizeProcessIdValue(processId) {
  if (typeof processId !== 'string') {
    return null
  }

  const normalized = processId.trim().toLowerCase()
  const clean = normalized.startsWith('0x') ? normalized.slice(2) : normalized

  if (!/^[0-9a-f]{62}$/u.test(clean)) {
    return null
  }

  return `0x${clean}`
}

function normalizeTimestamp(value) {
  if (!value) {
    return null
  }

  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()

  return Number.isFinite(timestamp) ? timestamp : null
}

function normalizeSequencerProcessSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return null
  }

  const processId = normalizeProcessIdValue(snapshot.processId)

  if (!processId) {
    return null
  }

  const lastVerifiedAt =
    snapshot.lastVerifiedAt instanceof Date
      ? snapshot.lastVerifiedAt.toISOString()
      : typeof snapshot.lastVerifiedAt === 'string'
        ? snapshot.lastVerifiedAt
        : null

  return {
    addressWeight:
      typeof snapshot.addressWeight === 'string' ? snapshot.addressWeight : null,
    error: typeof snapshot.error === 'string' ? snapshot.error : null,
    hasVoted: typeof snapshot.hasVoted === 'boolean' ? snapshot.hasVoted : null,
    isInCensus: typeof snapshot.isInCensus === 'boolean' ? snapshot.isInCensus : null,
    lastVerifiedAt,
    processId,
    status:
      snapshot.status === 'verified' ||
      snapshot.status === 'error' ||
      snapshot.status === 'unverified'
        ? snapshot.status
        : 'unverified',
  }
}

function normalizeSequencerProcessSnapshots(snapshot) {
  const sourceProcesses = Array.isArray(snapshot?.processes)
    ? snapshot.processes
    : snapshot?.processId
      ? [snapshot]
      : []
  const normalizedProcesses = []

  for (const process of sourceProcesses) {
    const normalizedProcess = normalizeSequencerProcessSnapshot(process)

    if (!normalizedProcess) {
      continue
    }

    const existingIndex = normalizedProcesses.findIndex(
      (entry) => entry.processId === normalizedProcess.processId,
    )

    if (existingIndex === -1) {
      normalizedProcesses.push(normalizedProcess)
    } else {
      normalizedProcesses[existingIndex] = normalizedProcess
    }
  }

  return normalizedProcesses
}

function getLatestSequencerProcess(processes) {
  let latestProcess = null
  let latestTimestamp = -1

  for (const process of processes) {
    const timestamp = normalizeTimestamp(process.lastVerifiedAt) ?? -1

    if (latestProcess === null || timestamp >= latestTimestamp) {
      latestProcess = process
      latestTimestamp = timestamp
    }
  }

  return latestProcess
}

function summarizeSequencerProcesses(processes) {
  const votesCasted = processes.reduce(
    (count, process) => count + (process.hasVoted === true ? 1 : 0),
    0,
  )
  const numOfProcessAsParticipant = processes.reduce(
    (count, process) => count + (process.isInCensus === true ? 1 : 0),
    0,
  )

  return {
    latestProcess: getLatestSequencerProcess(processes),
    numOfProcessAsParticipant,
    votesCasted,
  }
}

export function normalizeSequencerSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { ...emptySequencerSnapshot }
  }

  const processes = normalizeSequencerProcessSnapshots(snapshot)
  const summary = summarizeSequencerProcesses(processes)
  const latestProcess = summary.latestProcess

  return {
    addressWeight:
      typeof snapshot.addressWeight === 'string'
        ? snapshot.addressWeight
        : latestProcess?.addressWeight ?? null,
    error:
      typeof snapshot.error === 'string'
        ? snapshot.error
        : latestProcess?.error ?? null,
    hasVoted:
      processes.length > 0
        ? summary.votesCasted > 0
        : typeof snapshot.hasVoted === 'boolean'
          ? snapshot.hasVoted
          : null,
    isConnected: processes.length > 0 || Boolean(snapshot.isConnected),
    isInCensus:
      processes.length > 0
        ? summary.numOfProcessAsParticipant > 0
        : typeof snapshot.isInCensus === 'boolean'
          ? snapshot.isInCensus
          : null,
    lastVerifiedAt:
      processes.length > 0
        ? latestProcess?.lastVerifiedAt ?? null
        : snapshot.lastVerifiedAt instanceof Date
          ? snapshot.lastVerifiedAt.toISOString()
          : typeof snapshot.lastVerifiedAt === 'string'
            ? snapshot.lastVerifiedAt
            : null,
    numOfProcessAsParticipant: summary.numOfProcessAsParticipant,
    processId:
      normalizeProcessIdValue(snapshot.processId) ?? latestProcess?.processId ?? null,
    processes,
    status:
      snapshot.status === 'verified' ||
      snapshot.status === 'error' ||
      snapshot.status === 'unverified'
        ? snapshot.status
        : latestProcess?.status ?? 'unverified',
    votesCasted: summary.votesCasted,
  }
}

function createSequencerSdkFactory(config) {
  let sdkPromise = null

  return async function getSdk() {
    if (!sdkPromise) {
      sdkPromise = (async () => {
        const { DavinciSDK } = await import('@vocdoni/davinci-sdk')
        const sdk = new DavinciSDK({
          signer: Wallet.createRandom(),
          sequencerUrl: config.sequencer.apiUrl,
        })

        await sdk.init()
        return sdk
      })()
    }

    return sdkPromise
  }
}

export function createSequencerDependencies(config) {
  const getSdk = createSequencerSdkFactory(config)

  return {
    async verifyProcessStats({ walletAddress, processId }) {
      const normalizedProcessId = normalizeProcessIdValue(processId)

      if (!normalizedProcessId) {
        throw new Error('Process id is invalid.')
      }

      const sdk = await getSdk()
      const processIds = await sdk.api.sequencer.listProcesses()
      const normalizedProcessIds = new Set(
        processIds
          .map((value) => normalizeProcessIdValue(value))
          .filter((value) => value !== null),
      )

      if (!normalizedProcessIds.has(normalizedProcessId)) {
        throw new SequencerApiError('Process not found in the sequencer.', 404)
      }

      const [addressWeight, hasVoted] = await Promise.all([
        sdk.api.sequencer.getAddressWeight(normalizedProcessId, walletAddress),
        sdk.api.sequencer.hasAddressVoted(normalizedProcessId, walletAddress),
      ])

      return {
        addressWeight,
        hasVoted,
        isInCensus: addressWeight !== '0',
        processId: normalizedProcessId,
      }
    },
  }
}

export function mergeSequencerProcessVerification(
  snapshot,
  verification,
  lastVerifiedAt = new Date().toISOString(),
) {
  const normalizedSnapshot = normalizeSequencerSnapshot(snapshot)
  const normalizedProcess = normalizeSequencerProcessSnapshot({
    ...verification,
    error: null,
    lastVerifiedAt,
    status: 'verified',
  })

  if (!normalizedProcess) {
    return normalizedSnapshot
  }

  const nextProcesses = [...normalizedSnapshot.processes]
  const existingIndex = nextProcesses.findIndex(
    (process) => process.processId === normalizedProcess.processId,
  )

  if (existingIndex === -1) {
    nextProcesses.push(normalizedProcess)
  } else {
    nextProcesses[existingIndex] = normalizedProcess
  }

  return normalizeSequencerSnapshot({
    ...normalizedSnapshot,
    addressWeight: normalizedProcess.addressWeight,
    error: null,
    isConnected: true,
    lastVerifiedAt,
    processId: normalizedProcess.processId,
    processes: nextProcesses,
    status: 'verified',
  })
}

export function markSequencerProcessError(
  snapshot,
  processId,
  error,
  status = 'error',
) {
  const normalizedSnapshot = normalizeSequencerSnapshot(snapshot)
  const normalizedProcessId = normalizeProcessIdValue(processId)

  if (!normalizedProcessId) {
    return normalizedSnapshot
  }

  const nextProcesses = normalizedSnapshot.processes.map((process) =>
    process.processId === normalizedProcessId
      ? {
          ...process,
          error,
          status,
        }
      : process,
  )

  return normalizeSequencerSnapshot({
    ...normalizedSnapshot,
    error,
    isConnected: nextProcesses.length > 0,
    processId: normalizedProcessId,
    processes: nextProcesses,
    status,
  })
}
