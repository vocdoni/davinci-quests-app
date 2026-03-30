const faqItems = [
  {
    answer:
      'Check the DAVINCI leaderboard. Automated quests update in near real-time. Manually reviewed quests (build submissions, content posts) may take 24-72 hours to be verified and credited.',
    question: 'How do I know my points were recorded?',
  },
  {
    answer:
      'Yes, if you have a verified GitHub profile, you can earn points from both User Track and Builder Track quests simultaneously.',
    question: 'Can I participate in both tracks?',
  },
  {
    answer:
      'Reach out in the #quest-support channel on Discord. The team will investigate and correct any discrepancies.',
    question: 'What if I think my points are wrong?',
  },
  {
    answer:
      "When you create a voting process on DAVINCI, it's recorded on-chain via the ProcessRegistry contract. Your quest progress updates automatically as you create more processes. You can also earn points when other users vote in processes you created, the more people participate in your governance, the more you earn.",
    question: 'How do voting process creation quests work?',
  },
  {
    answer:
      "Any legitimate governance process created through the DAVINCI protocol. Spam or empty processes created solely to farm points will be flagged and won't count toward your quest progress.",
    question: 'What counts as a valid voting process?',
  },
  {
    answer:
      'Sequencers are the infrastructure backbone of DAVINCI, they submit state transitions, settle votes and overwrites, and submit results on-chain. Builders who run Sequencer nodes earn points based on their on-chain contributions, tracked via the ProcessRegistry contract. These are among the highest-value quests in the program.',
    question: 'What are Sequencer quests?',
  },
  {
    answer:
      'The DAVINCI team evaluates Builder Track submissions based on technical quality, originality, and real traction (unique users, on-chain usage). Rankings are announced at the end of each sprint cycle.',
    question: 'How are sprint campaign rankings decided?',
  },
  {
    answer:
      'Points cannot be taken away for normal activity. However, confirmed sybil attacks, spam, plagiarism, or other abuse will result in disqualification and forfeiture of all accumulated points.',
    question: 'Can I lose points?',
  },
  {
    answer:
      'No cap. The more you contribute, the more you earn. Power users and prolific builders will naturally accumulate more points.',
    question: 'Is there a cap on how many points I can earn?',
  },
]

export function FaqPage() {
  return (
    <section className="content-panel page-panel faq-page">
      <div className="faq-hero">
        <p className="section-eyebrow">FAQ</p>
        <h1 className="page-title">Questions people usually ask first.</h1>
        <p className="faq-lede">
          The basics of points, quests, reviews, and on-chain progress tracking,
          all in one place.
        </p>
      </div>

      <div className="faq-list">
        {faqItems.map((item, index) => (
          <details
            className="faq-item"
            key={item.question}
            open={index === 0}
          >
            <summary className="faq-summary">
              <span className="faq-question-marker">Q</span>
              <span className="faq-question">{item.question}</span>
              <span className="faq-toggle-indicator" aria-hidden="true" />
            </summary>

            <div className="faq-answer-shell">
              <p className="faq-answer">{item.answer}</p>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
