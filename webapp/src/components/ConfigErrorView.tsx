type ConfigErrorViewProps = {
  message: string
}

export function ConfigErrorView({ message }: ConfigErrorViewProps) {
  return (
    <main className="dashboard-shell">
      <section className="surface state-panel">
        <p className="surface__eyebrow">Configuration error</p>
        <h1>The dashboard is missing a required environment value.</h1>
        <p className="surface__copy">{message}</p>
      </section>
    </main>
  )
}
