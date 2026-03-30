const eligibilityRules = [
  'Anyone can participate in the User Track. No gate, no requirements, just connect your wallet and start.',
  'The Builder Track requires a verified GitHub profile (account age more than 1 year or demonstrable activity) to ensure only real developers participate.',
  'One wallet per person. One identity per person. This is non-negotiable.',
]

const earningPointRules = [
  'Points are awarded automatically where possible (on-chain actions, bot checks, platform events). For actions requiring review (build proposals, content submissions, event attendance), the DAVINCI team will verify and award points manually.',
  'Referral rewards only trigger when the referred person completes a meaningful action, not just signing up. For users, that means casting their first on-chain vote. For builders, that means deploying a working use case.',
  'Points are non-transferable and cannot be bought, sold, or traded.',
  'The DAVINCI team reserves the right to adjust point values between sprint cycles to keep incentives balanced and fair.',
]

const fairPlayRules = [
  'Sybil attacks (creating multiple accounts to farm points) will result in permanent disqualification and forfeiture of all points.',
  'Bot-generated activity, fake referrals, and spam content will be flagged and removed.',
  'Creating empty or spam voting processes to farm points will not be counted. Processes must be legitimate governance actions.',
  'Builder Track submissions must be original work. Plagiarized or trivially forked projects will not be awarded points.',
  'Sprint campaign rankings are judged on both quality and real traction (unique users, on-chain activity) - not just completion.',
]

const pointTiers = [
  {
    description:
      'Quick, one-click actions like following on X, joining Telegram or Discord, or asking a question during an AMA.',
    title: 'Micro Actions (10-25 pts)',
  },
  {
    description:
      'Actions that take a few minutes: casting your first vote, verifying your identity, posting original content, referring a friend, getting users to vote in your processes.',
    title: 'Standard Actions (30-75 pts)',
  },
  {
    description:
      'Higher-effort contributions: creating multiple voting processes, completing a full sprint campaign, referring 5 active users, submitting a build proposal, running Sequencer infrastructure milestones.',
    title: 'Power Actions (100-200 pts)',
  },
  {
    description:
      'Serious commitments: deploying a working use case on the DAVINCI SDK, creating 20+ voting processes, hitting 200 unique users, winning a sprint campaign ranking, sustained Sequencer uptime.',
    title: 'Elite Actions (300-500 pts)',
  },
]

function RuleList({ items }: { items: string[] }) {
  return (
    <ul className="rules-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

export function RulesPage() {
  return (
    <section className="content-panel page-panel rules-page">
      <div className="rules-hero">
        <p className="section-eyebrow">Rules</p>
        <h1 className="page-title">DAVINCI Quests Rules</h1>
        <p className="rules-lede">
          DAVINCI is building the infrastructure for truly democratic,
          privacy-preserving decision-making. Every quest you complete helps prove
          that gasless, identity-verified on-chain governance is not just an idea:
          it works, and real people use it.
        </p>
        <p className="rules-paragraph">
          DAVINCI Quests is a community participation program that rewards you for
          supporting decentralized governance. By completing quests, simple
          actions like voting in polls, joining our community, and spreading the
          word, you earn points that reflect your contribution to the DAVINCI
          ecosystem.
        </p>
      </div>

      <div className="rules-grid">
        <article className="rules-card">
          <div className="rules-card-header">
            <p className="rules-kicker">Overview</p>
            <h2 className="rules-section-title">How It Works</h2>
          </div>

          <p className="rules-paragraph">
            You earn points by completing quests across two tracks. Your total
            points are tracked on the DAVINCI leaderboard and represent your
            standing as an early supporter of the protocol.
          </p>

          <div className="rules-track-grid">
            <article className="rules-track-card">
              <p className="rules-track-label">User Track</p>
              <p className="rules-track-copy">
                Open to everyone. Vote in polls, join the community, share
                content, and bring in friends. This track proves that the
                DAVINCI protocol is actively used by real people.
              </p>
            </article>

            <article className="rules-track-card">
              <p className="rules-track-label">Builder Track</p>
              <p className="rules-track-copy">
                For developers with verified GitHub accounts. Build real use
                cases on the DAVINCI SDK, hit traction milestones, and compete
                in sprint campaigns. This track proves the protocol is powerful
                enough for serious builders to ship real products on.
              </p>
            </article>
          </div>
        </article>

        <article className="rules-card">
          <div className="rules-card-header">
            <p className="rules-kicker">Participation</p>
            <h2 className="rules-section-title">Eligibility</h2>
          </div>
          <RuleList items={eligibilityRules} />
        </article>

        <article className="rules-card">
          <div className="rules-card-header">
            <p className="rules-kicker">Points</p>
            <h2 className="rules-section-title">Earning Points</h2>
          </div>
          <RuleList items={earningPointRules} />
        </article>

        <article className="rules-card">
          <div className="rules-card-header">
            <p className="rules-kicker">Integrity</p>
            <h2 className="rules-section-title">Fair Play</h2>
          </div>
          <RuleList items={fairPlayRules} />
        </article>

        <article className="rules-card">
          <div className="rules-card-header">
            <p className="rules-kicker">Scoring</p>
            <h2 className="rules-section-title">Point Values</h2>
          </div>
          <p className="rules-paragraph">
            Points are structured in four tiers based on effort:
          </p>

          <div className="rules-tier-grid">
            {pointTiers.map((tier) => (
              <article
                className="rules-tier-card"
                key={tier.title}
              >
                <h3 className="rules-tier-title">{tier.title}</h3>
                <p className="rules-tier-copy">{tier.description}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="rules-card rules-card-highlight">
          <div className="rules-card-header">
            <p className="rules-kicker">Looking Ahead</p>
            <h2 className="rules-section-title">What Happens With My Points?</h2>
          </div>

          <p className="rules-paragraph">
            Your points represent your provable contribution to the DAVINCI
            ecosystem as an early supporter. While we cannot make specific
            promises today, the DAVINCI team deeply values early community
            members who show up, participate, and help build momentum toward our
            vision of decentralized governance.
          </p>
          <p className="rules-paragraph">
            We believe in rewarding the people who believed early. Your
            participation history, every vote, every referral, every quest
            completed, is being recorded on-chain and on the leaderboard. When
            the time comes, early supporters will be in the best position to
            benefit from the growth of the protocol.
          </p>
          <p className="rules-closing">Keep stacking points. Keep showing up. Democracy needs its champions.</p>
        </article>
      </div>
    </section>
  )
}
