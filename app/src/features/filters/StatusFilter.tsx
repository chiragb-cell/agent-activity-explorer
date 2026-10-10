// Status as a segmented control built from native radio buttons: one click to switch,
// arrow keys move between options, and screen readers announce "Status, radio group".

import type { KnownStatus } from '../../api/schemas'
import { STATUS_LABELS } from '../../lib/status'
import { setStatus } from '../../url/useView'
import styles from './StatusFilter.module.css'

const OPTIONS: Array<{ value: KnownStatus | null; label: string }> = [
  { value: null, label: 'All' },
  { value: 'ok', label: STATUS_LABELS.ok },
  { value: 'blocked', label: STATUS_LABELS.blocked },
  { value: 'error', label: STATUS_LABELS.error },
]

export function StatusFilter({ value }: { value: KnownStatus | null }) {
  return (
    <fieldset className={styles.group}>
      <legend className="visually-hidden">Status</legend>
      <span className={styles.label} aria-hidden="true">
        Status
      </span>
      <div className={styles.segments}>
        {OPTIONS.map((option) => (
          <label key={option.label} className={styles.segment}>
            <input
              className={styles.radio}
              type="radio"
              name="status"
              value={option.value ?? 'all'}
              checked={value === option.value}
              onChange={() => setStatus(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
