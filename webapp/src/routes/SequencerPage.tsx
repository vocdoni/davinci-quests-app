import { Hourglass, Search, WarningTriangle } from 'iconoir-react'
import type { SequencerStats, SequencerVerification } from '../hooks/useAppSession'

type SequencerPageProps = {
  currentSnapshot: SequencerStats | null
  errorMessage: string | null
  isSessionActionDisabled: boolean
  isSignedIn: boolean
  processId: string
  profileRequiresSignIn: boolean
  recentResult: SequencerVerification | null
  onNavigateToProfile: () => void
  onProcessIdChange: (value: string) => void
  onVerify: () => void
}

function formatVerificationDate(value: string | null) {
  if (!value) {
    return 'Not verified yet'
  }

  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function getResultSnapshot(
  currentSnapshot: SequencerStats | null,
  recentResult: SequencerVerification | null,
) {
  return recentResult ?? currentSnapshot
}

function getResultStatusLabel(
  currentSnapshot: SequencerStats | null,
  recentResult: SequencerVerification | null,
) {
  if (recentResult?.status === 'error') {
    return 'Error'
  }

  if ((recentResult?.isConnected ?? Boolean(currentSnapshot?.processes.length)) || Boolean(currentSnapshot?.processes.length)) {
    return 'Verified'
  }

  return 'Unverified'
}

function getProcessStatusLabel(value: boolean | null) {
  if (value === null) {
    return 'Unknown'
  }

  return value ? 'Yes' : 'No'
}

export function SequencerPage({
  currentSnapshot,
  errorMessage,
  isSessionActionDisabled,
  isSignedIn,
  processId,
  profileRequiresSignIn,
  recentResult,
  onNavigateToProfile,
  onProcessIdChange,
  onVerify,
}: SequencerPageProps) {
  const resultSnapshot = getResultSnapshot(currentSnapshot, recentResult)
  const storedProcessIds = recentResult
    ? recentResult.processes.map((process) => process.processId)
    : currentSnapshot?.processes ?? []
  const storedProcessCount = recentResult
    ? recentResult.processes.length
    : currentSnapshot?.processes.length ?? 0
  const participantProcessCount = recentResult
    ? recentResult.numOfProcessAsParticipant
    : currentSnapshot?.numOfProcessAsParticipant ?? 0
  const votesCasted = recentResult ? recentResult.votesCasted : currentSnapshot?.votesCasted ?? 0
  const lastVerifiedAt = recentResult?.lastVerifiedAt ?? currentSnapshot?.lastVerifiedAt ?? null
  const statusLabel = getResultStatusLabel(currentSnapshot, recentResult)

  return (
    <section className="profile-stack">
      <div className="content-panel page-panel">
        <p className="section-eyebrow">Sequencer</p>
        <h1 className="page-title">Verify a process against your wallet.</h1>
        <p className="body-copy">
          Submit a DAVINCI process id and the server will check whether your
          wallet is in the census and whether you have voted in that process.
        </p>

        {profileRequiresSignIn ? (
          <div className="quest-role-lockout quest-role-lockout-inline">
            <span>Sign in with your wallet before verifying a process.</span>
            <button
              className="quest-role-profile-link"
              onClick={onNavigateToProfile}
              type="button"
            >
              Go to profile
            </button>
          </div>
        ) : null}
      </div>

      <div className="content-panel page-panel">
        <h2 className="panel-title">Process verification</h2>
        <p className="body-copy">
          Paste a process id and we will store the verification snapshot on your
          profile.
        </p>

        <div className="sequencer-form">
          <label
            className="sequencer-process-label"
            htmlFor="sequencer-process-id"
          >
            Process id
          </label>
          <input
            className="twitter-proof-input sequencer-process-input"
            id="sequencer-process-id"
            onChange={(event) => {
              onProcessIdChange(event.target.value)
            }}
            placeholder="0x..."
            type="text"
            value={processId}
          />
          <button
            className="minimal-button sequencer-verify-button"
            disabled={!isSignedIn || isSessionActionDisabled || processId.trim().length === 0}
            onClick={onVerify}
            type="button"
          >
            <Search
              aria-hidden={true}
              className="quest-card-cta-icon"
            />
            {isSessionActionDisabled ? 'Verifying...' : 'Verify process'}
          </button>
        </div>

        {errorMessage ? (
          <div className="sequencer-status-card is-error">
            <WarningTriangle
              aria-hidden={true}
              className="sequencer-status-icon"
            />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {resultSnapshot ? (
          <div className="sequencer-status-card">
            <div className="sequencer-status-head">
              <span className="sequencer-status-label">Sequencer summary</span>
              <span className="sequencer-status-chip">{statusLabel}</span>
            </div>
            <div className="sequencer-status-grid">
              <div>
                <span className="sequencer-status-key">Stored processes</span>
                <p className="sequencer-status-value">
                  {storedProcessCount}
                </p>
              </div>
              <div>
                <span className="sequencer-status-key">Participant processes</span>
                <p className="sequencer-status-value">
                  {participantProcessCount}
                </p>
              </div>
              <div>
                <span className="sequencer-status-key">Votes casted</span>
                <p className="sequencer-status-value">
                  {votesCasted}
                </p>
              </div>
              <div>
                <span className="sequencer-status-key">Verified at</span>
                <p className="sequencer-status-value">
                  {formatVerificationDate(lastVerifiedAt)}
                </p>
              </div>
            </div>
            {recentResult?.processes.length ? (
              <div className="sequencer-process-list">
                {recentResult.processes.map((process) => (
                  <article
                    className="sequencer-process-card"
                    key={process.processId}
                  >
                    <div className="sequencer-process-card-head">
                      <span className="sequencer-status-label">Process</span>
                      <span className="sequencer-status-chip">{process.status}</span>
                    </div>
                    <p className="sequencer-process-id">{process.processId}</p>
                    <div className="sequencer-process-meta">
                      <span>Weight {process.addressWeight ?? '0'}</span>
                      <span>In census: {getProcessStatusLabel(process.isInCensus)}</span>
                      <span>Voted: {getProcessStatusLabel(process.hasVoted)}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : storedProcessIds.length > 0 ? (
              <div className="sequencer-process-list">
                {storedProcessIds.map((processId) => (
                  <article
                    className="sequencer-process-card"
                    key={processId}
                  >
                    <div className="sequencer-process-card-head">
                      <span className="sequencer-status-label">Stored process</span>
                      <span className="sequencer-status-chip">stored</span>
                    </div>
                    <p className="sequencer-process-id">{processId}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {!resultSnapshot ? (
          <div className="sequencer-status-card">
            <Hourglass
              aria-hidden={true}
              className="sequencer-status-icon"
            />
            <span>No process has been verified yet.</span>
          </div>
        ) : null}
      </div>
    </section>
  )
}
