import {
  CheckCircle,
  Community,
  Developer,
  Hourglass,
  Lock,
  ArrowRight,
  Trophy,
} from 'iconoir-react'
import * as Iconoir from 'iconoir-react'
import type { ComponentType, SVGProps } from 'react'
import type { QuestRequirementSource, QuestRole } from '../lib/quests'
import { getQuestRequirementSource } from '../lib/quests'
import type { QuestProgressSummary, ResolvedQuest } from './types'

type QuestRouteAction = {
  icon?: string | null
  url: string
}

type QuestIconComponent = ComponentType<SVGProps<SVGSVGElement>>
const ICONOIR_COMPONENTS = Iconoir as unknown as Record<string, QuestIconComponent>

type QuestsPageProps = {
  isBuilderRoleUnlocked: boolean
  isGithubConnected: boolean
  isSelectedQuestRoleLocked: boolean
  questCounts: Record<QuestRole, number>
  questErrorMessage: string
  questLoadingMessage: string | null
  questProgressByRole: QuestProgressSummary
  questsAreError: boolean
  resolvedQuests: ResolvedQuest[]
  selectedQuestRole: QuestRole
  sourceConnections: Record<QuestRequirementSource, boolean>
  totalEarnedQuestPoints: number
  onNavigateToProfile: () => void
  onNavigateToPath: (path: string) => void
  onSelectQuestRole: (role: QuestRole) => void
}

const QUEST_ROLE_LABELS: Record<QuestRole, string> = {
  builders: 'Builders',
  supporters: 'Supporters',
}

function getQuestRoleDescription(role: QuestRole) {
  return role === 'builders'
    ? 'Builder quests are for contributors who unlocked the role by connecting GitHub.'
    : 'Supporter quests are open to everyone and help you get started with the community.'
}

function getQuestCountLabel(count: number) {
  return `${count} quest${count === 1 ? '' : 's'} available`
}

function getQuestStatusBadge({
  isCompleted,
  isLocked,
}: {
  isCompleted: boolean
  isLocked: boolean
}) {
  if (isLocked) {
    return {
      icon: Lock,
      label: 'Locked',
      statusClassName: 'is-locked',
    }
  }

  if (isCompleted) {
    return {
      icon: CheckCircle,
      label: 'Completed',
      statusClassName: 'is-complete',
    }
  }

  return {
    icon: Hourglass,
    label: 'Pending',
    statusClassName: 'is-pending',
  }
}

function isInternalRoute(url: string) {
  return url.startsWith('/') && !url.startsWith('//')
}

function runQuestRouteAction(
  action: QuestRouteAction | null | undefined,
  onNavigateToPath: (path: string) => void,
) {
  if (!action) {
    return
  }

  if (isInternalRoute(action.url)) {
    onNavigateToPath(action.url)
    return
  }

  window.open(action.url, '_blank', 'noopener,noreferrer')
}

function resolveQuestIcon(
  iconName: string | null | undefined,
  fallbackName: string,
) {
  if (iconName && ICONOIR_COMPONENTS[iconName]) {
    return ICONOIR_COMPONENTS[iconName]
  }

  return ICONOIR_COMPONENTS[fallbackName] ?? ArrowRight
}

export function QuestsPage({
  isBuilderRoleUnlocked,
  isGithubConnected,
  isSelectedQuestRoleLocked,
  questCounts,
  questErrorMessage,
  questLoadingMessage,
  questProgressByRole,
  questsAreError,
  resolvedQuests,
  selectedQuestRole,
  sourceConnections,
  totalEarnedQuestPoints,
  onNavigateToProfile,
  onNavigateToPath,
  onSelectQuestRole,
}: QuestsPageProps) {
  return (
    <section className="profile-stack">
      <div className="content-panel page-panel">
        <p className="section-eyebrow">Quests</p>
        <h1 className="page-title">Complete quests and earn points.</h1>
        <p className="body-copy">
          Choose the role that fits you best. Supporters are open to everyone,
          while Builder quests unlock after you connect GitHub from your profile.
        </p>

        <div
          aria-label="Quest roles"
          className="quest-role-picker"
          role="tablist"
        >
          {(['supporters', 'builders'] as QuestRole[]).map((role) => {
            const isLocked = role === 'builders' && !isBuilderRoleUnlocked
            const isSelected = selectedQuestRole === role
            const questCountLabel = questLoadingMessage
              ? 'Loading quests...'
              : getQuestCountLabel(questCounts[role])

            return (
              <article
                aria-selected={isSelected}
                className={`quest-role-card ${isSelected ? 'is-active' : ''} ${isLocked ? 'is-locked' : ''}`}
                key={role}
                onClick={() => {
                  onSelectQuestRole(role)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectQuestRole(role)
                  }
                }}
                role="tab"
                tabIndex={0}
              >
                <div className="quest-role-card-copy">
                  <div className="quest-role-card-header">
                  <h2 className="quest-role-card-title">{QUEST_ROLE_LABELS[role]}</h2>
                    {isSelected ? (
                      <span className="quest-role-selected-badge">Selected</span>
                    ) : null}
                  </div>

                  <p className="quest-role-card-description">
                    {getQuestRoleDescription(role)}
                  </p>

                  {!isSelected ? (
                    <p className="quest-role-note">Click change to this track</p>
                  ) : null}

                  {role === 'builders' && !isBuilderRoleUnlocked ? (
                    <div className="quest-role-lockout">
                      <span>Connect your GitHub account to unlock it.</span>
                      <button
                        className="quest-role-profile-link"
                        onClick={(event) => {
                          event.stopPropagation()
                          onNavigateToProfile()
                        }}
                        type="button"
                      >
                        Go to profile
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="quest-role-card-footer">
                  <span className="quest-role-count">{questCountLabel}</span>
                </div>
              </article>
            )
          })}
        </div>
      </div>

      <div
        className={`quest-overview-bar ${isGithubConnected ? '' : 'is-builders-hidden'}`.trim()}
      >
        <div className="quest-overview-metric">
          <span className="quest-overview-icon-shell" aria-hidden="true">
            <Community className="quest-overview-icon" />
          </span>
          <div className="quest-overview-copy">
            <span className="quest-overview-label">Supporters</span>
            <span className="quest-overview-value">
              {questProgressByRole.supporters.completed}/
              {questProgressByRole.supporters.total} completed
            </span>
            <span className="quest-overview-meta">
              {questProgressByRole.supporters.points} pts earned
            </span>
            <div className="quest-overview-mobile-stack" aria-hidden="true">
              <span className="quest-overview-mobile-value">
                {questProgressByRole.supporters.completed}/
                {questProgressByRole.supporters.total}
              </span>
              <span className="quest-overview-mobile-meta">
                {questProgressByRole.supporters.points} pts
              </span>
            </div>
          </div>
        </div>

        {isGithubConnected ? (
          <div className="quest-overview-metric">
            <span className="quest-overview-icon-shell" aria-hidden="true">
              <Developer className="quest-overview-icon" />
            </span>
            <div className="quest-overview-copy">
              <span className="quest-overview-label">Builders</span>
              <span className="quest-overview-value">
                {questProgressByRole.builders.completed}/
                {questProgressByRole.builders.total} completed
              </span>
              <span className="quest-overview-meta">
                {questProgressByRole.builders.points} pts earned
              </span>
              <div className="quest-overview-mobile-stack" aria-hidden="true">
                <span className="quest-overview-mobile-value">
                  {questProgressByRole.builders.completed}/
                  {questProgressByRole.builders.total}
                </span>
                <span className="quest-overview-mobile-meta">
                  {questProgressByRole.builders.points} pts
                </span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="quest-overview-metric is-total">
          <span className="quest-overview-icon-shell" aria-hidden="true">
            <Trophy className="quest-overview-icon" />
          </span>
          <div className="quest-overview-copy">
            <span className="quest-overview-label">Total</span>
            <span className="quest-overview-value">{totalEarnedQuestPoints} pts</span>
            <span className="quest-overview-meta">earned across all roles</span>
            <div className="quest-overview-mobile-stack" aria-hidden="true">
              <span className="quest-overview-mobile-value">{totalEarnedQuestPoints}</span>
              <span className="quest-overview-mobile-meta">pts</span>
            </div>
          </div>
        </div>
      </div>

      <div className="content-panel page-panel">
        <div className="quest-summary-row">
          <div className="quest-summary-copy">
            <p className="section-eyebrow">Roadmap</p>
            <h2 className="panel-title">{QUEST_ROLE_LABELS[selectedQuestRole]} quests</h2>
            <p className="body-copy">{getQuestRoleDescription(selectedQuestRole)}</p>
            {isSelectedQuestRoleLocked ? (
              <div className="quest-role-lockout quest-role-lockout-inline">
                <span>
                  Connect your GitHub account from your profile to unlock progress
                  tracking.
                </span>
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
        </div>

        {questLoadingMessage ? (
          <p className="body-copy quest-state-copy">{questLoadingMessage}</p>
        ) : questsAreError ? (
          <p className="body-copy quest-state-copy">{questErrorMessage}</p>
        ) : resolvedQuests.length === 0 ? (
          <p className="body-copy quest-state-copy">
            No quests are available for this role yet.
          </p>
        ) : (
          <div className="quest-list">
            {resolvedQuests.map((quest) => {
              const statusBadge = getQuestStatusBadge({
                isCompleted: quest.isCompleted,
                isLocked: isSelectedQuestRoleLocked,
              })
              const questRequirementSource = getQuestRequirementSource(quest.achievement)
              const isQuestSourceConnected =
                questRequirementSource === null
                  ? true
                  : sourceConnections[questRequirementSource]
              const shouldShowQuestConnectionCta =
                !quest.isCompleted && Boolean(quest.connectButton)
              const CallToActionIcon = resolveQuestIcon(
                quest.callToAction?.icon,
                'ArrowRight',
              )
              const ConnectButtonIcon = resolveQuestIcon(
                quest.connectButton?.icon,
                isInternalRoute(quest.connectButton?.url ?? '') ? 'ArrowRight' : 'UserPlus',
              )

              return (
                <article
                  className={`quest-card ${quest.isCompleted ? 'is-complete' : ''} ${isSelectedQuestRoleLocked ? 'is-locked' : ''}`}
                  key={`${selectedQuestRole}:${quest.id}`}
                >
                  <div className="quest-card-meta">
                    <span className="quest-order">Quest {quest.id}</span>
                    <div className="quest-card-meta-actions">
                      <span className={`quest-status-badge ${statusBadge.statusClassName}`}>
                        <statusBadge.icon
                          aria-hidden={true}
                          className="quest-status-icon"
                        />
                        {statusBadge.label}
                      </span>
                      <span className="quest-points-chip">{quest.points} pts</span>
                    </div>
                  </div>

                  <h3 className="quest-card-title">{quest.title}</h3>
                  <p className="quest-card-description">{quest.description}</p>
                  {quest.progressHint ? (
                    <div className="quest-card-progress-shell">
                      <p className="quest-card-progress">
                        {quest.progressHint.remaining} more to complete
                      </p>
                      <div className="quest-card-progress-row">
                        <div
                          aria-hidden="true"
                          className="quest-card-progress-bar"
                        >
                          <span
                            className="quest-card-progress-bar-fill"
                            style={{
                              width: `${Math.max(
                                8,
                                Math.min(
                                  100,
                                  (quest.progressHint.current /
                                    quest.progressHint.required) *
                                    100,
                                ),
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="quest-card-progress-required">
                          {quest.progressHint.required} required
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {!quest.isCompleted &&
                  (quest.callToAction || shouldShowQuestConnectionCta) ? (
                    <div className="quest-card-cta">
                      {shouldShowQuestConnectionCta ? (
                        <button
                          className="quest-card-cta-connect-button minimal-button"
                          onClick={() => {
                            runQuestRouteAction(
                              quest.connectButton,
                              onNavigateToPath,
                            )
                          }}
                          type="button"
                        >
                          <ConnectButtonIcon
                            aria-hidden={true}
                            className="quest-card-cta-icon"
                          />
                          {quest.connectButton?.title}
                        </button>
                      ) : null}
                      {quest.callToAction ? (
                        <div className="quest-card-cta-main">
                          <button
                            className="quest-card-cta-button"
                            disabled={!isQuestSourceConnected}
                            onClick={() => {
                              const url = quest.callToAction?.url ?? ''

                              if (isInternalRoute(url)) {
                                onNavigateToPath(url)
                                return
                              }

                              window.open(url, '_blank', 'noopener,noreferrer')
                            }}
                            type="button"
                          >
                            <CallToActionIcon
                              aria-hidden={true}
                              className="quest-card-cta-icon"
                            />
                            {quest.callToAction.title}
                          </button>
                          {quest.callToAction.help ? (
                            <p className="quest-card-cta-help">
                              {quest.callToAction.help}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
