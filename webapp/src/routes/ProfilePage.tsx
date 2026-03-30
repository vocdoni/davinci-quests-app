import {
  Discord,
  Github,
  Telegram,
  X,
} from 'iconoir-react'
import type { ConnectionRow, ConnectionVariant, TwitterProofState } from './types'

type ProfilePageProps = {
  connectionRows: ConnectionRow[]
  isSessionActionDisabled: boolean
  isSignedIn: boolean
  profileRequiresSignIn: boolean
  providerAction: ConnectionVariant | null
  showSessionPanel: boolean
  signedAddress: string | null
  twitterProof: TwitterProofState | null
  onDisconnect: () => void
  onTwitterProofChange: (tweetUrl: string) => void
  onTwitterVerify: () => void
}

function ConnectionProviderIcon({ variant }: { variant: ConnectionVariant }) {
  if (variant === 'discord') {
    return <Discord className="connection-provider-icon" />
  }

  if (variant === 'github') {
    return <Github className="connection-provider-icon" />
  }

  if (variant === 'telegram') {
    return <Telegram className="connection-provider-icon" />
  }

  return <X className="connection-provider-icon" />
}

export function ProfilePage({
  connectionRows,
  isSessionActionDisabled,
  isSignedIn,
  profileRequiresSignIn,
  providerAction,
  showSessionPanel,
  signedAddress,
  twitterProof,
  onDisconnect,
  onTwitterProofChange,
  onTwitterVerify,
}: ProfilePageProps) {
  return (
    <section className="profile-stack">
      <div className="content-panel page-panel">
        <p className="section-eyebrow">Profile</p>
        <div className="page-title-row">
          <h1 className="page-title">My profile</h1>
          {signedAddress ? <span className="address-chip">{signedAddress}</span> : null}
        </div>
        <p className="body-copy">
          Connect the rest of your identities here. This view now stays focused on
          account linking only.
        </p>
      </div>

      <div className="content-panel page-panel">
        <h2 className="panel-title">Connections</h2>
        <p className="body-copy">
          {profileRequiresSignIn
            ? 'Use the login button in the navbar to connect your wallet and sign in before linking the rest of your accounts.'
            : 'All linked accounts are managed from this page.'}
        </p>

        <div className="connection-list">
          {connectionRows.map((connection) => (
            <article
              className="connection-row"
              key={connection.name}
            >
              <div className="connection-meta">
                <div className="connection-name-row">
                  <span
                    aria-hidden="true"
                    className="connection-icon-shell"
                  >
                    <ConnectionProviderIcon variant={connection.variant} />
                  </span>
                  <p className="connection-name">{connection.name}</p>
                </div>
                <p className="connection-username">
                  {connection.isConnected
                    ? connection.username ?? 'Connected account'
                    : 'Not connected'}
                </p>
              </div>

              <div className="connection-actions">
                {connection.isConnected ? (
                  <button
                    aria-label={`Remove ${connection.name}`}
                    className="inline-danger-button"
                    disabled={!isSignedIn || providerAction !== null}
                    onClick={connection.onClick}
                    type="button"
                  >
                    {providerAction === connection.variant ? 'Removing...' : 'Remove'}
                  </button>
                ) : (
                  <button
                    className={`minimal-button ${connection.variant}-button`}
                    disabled={!isSignedIn || providerAction !== null}
                    onClick={connection.onClick}
                    type="button"
                  >
                    {connection.statusLabel}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>

        {twitterProof ? (
          <div className="twitter-proof-shell">
            <p className="twitter-proof-label">
              Post this code on X, then paste the post URL below.
            </p>
            <p className="twitter-proof-code">{twitterProof.code}</p>
            <p className="body-copy twitter-proof-meta">
              Code expires at {twitterProof.expiresAt}
            </p>
            <label
              className="twitter-proof-label"
              htmlFor="twitter-proof-url"
            >
              Post URL
            </label>
            <input
              className="twitter-proof-input"
              id="twitter-proof-url"
              onChange={(event) => {
                onTwitterProofChange(event.target.value)
              }}
              placeholder="https://x.com/your-handle/status/1234567890"
              type="url"
              value={twitterProof.tweetUrl}
            />
            <button
              className="minimal-button twitter-verify-button"
              disabled={!twitterProof.tweetUrl.trim() || providerAction !== null}
              onClick={onTwitterVerify}
              type="button"
            >
              Verify post
            </button>
          </div>
        ) : null}
      </div>

      {showSessionPanel ? (
        <div className="content-panel page-panel session-panel">
          <h2 className="panel-title">Session</h2>
          <p className="body-copy">
            Disconnecting here will also close the current signed session.
          </p>
          <div>
            <button
              className="minimal-button session-danger-button"
              disabled={isSessionActionDisabled}
              onClick={onDisconnect}
              type="button"
            >
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
