// Every active filter as a removable chip, so the full view is visible at a glance
// (selected agents would otherwise be hidden inside the agent panel).

import { STATUS_LABELS } from '../../lib/status'
import { clearFilters, clearSearch, setAgents, setStatus } from '../../url/useView'
import { hasActiveFilters, type ViewState } from '../../url/view'
import { Button } from '../../components/Button'
import styles from './FilterChips.module.css'

export function FilterChips({ view }: { view: ViewState }) {
  if (!hasActiveFilters(view)) return null
  return (
    <ul className={styles.chips} aria-label="Active filters">
      {view.q ? <Chip name="Search" value={`“${view.q}”`} onRemove={clearSearch} /> : null}
      {view.status ? (
        <Chip name="Status" value={STATUS_LABELS[view.status]} onRemove={() => setStatus(null)} />
      ) : null}
      {view.agents.map((agent) => (
        <Chip
          key={agent}
          name="Agent"
          value={agent}
          onRemove={() => setAgents(view.agents.filter((a) => a !== agent))}
        />
      ))}
      <li>
        <Button size="sm" variant="ghost" onClick={clearFilters}>
          Clear all
        </Button>
      </li>
    </ul>
  )
}

function Chip({ name, value, onRemove }: { name: string; value: string; onRemove: () => void }) {
  return (
    <li className={styles.chip}>
      <span className={styles.name}>{name}:</span>
      <span className={styles.value}>{value}</span>
      <button
        type="button"
        className={styles.remove}
        aria-label={`Remove filter ${name}: ${value}`}
        onClick={onRemove}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </svg>
      </button>
    </li>
  )
}
