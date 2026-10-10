import styles from './App.module.css'

export function App() {
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <svg className={styles.logo} viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="currentColor" />
          <path
            d="M5 17h5l3-8 6 15 3-7h5"
            fill="none"
            stroke="var(--color-on-accent)"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h1 className={styles.title}>Agent Activity</h1>
        <p className={styles.tagline}>Every tool call your agents made</p>
      </header>
      <main className={styles.main} />
    </div>
  )
}
