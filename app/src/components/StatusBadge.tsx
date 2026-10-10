import { isKnownStatus, type KnownStatus } from '../api/schemas'
import { cx } from '../lib/cx'
import { STATUS_LABELS } from '../lib/status'
import styles from './StatusBadge.module.css'

const ICON_PATHS: Record<KnownStatus | 'unknown', string> = {
  ok: 'M3.5 8.5l3 3 6-7',
  blocked: 'M4 4l8 8M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z',
  error: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  unknown: 'M8 8h.01',
}

/**
 * Status as icon + text, never colour alone, so it reads the same for colour-blind users
 * and in high-contrast modes. A status the API adds later still renders, neutrally.
 */
export function StatusBadge({ status }: { status: string }) {
  const known = isKnownStatus(status) ? status : null
  return (
    <span className={cx(styles.badge, styles[known ?? 'unknown'])}>
      <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true">
        <path d={ICON_PATHS[known ?? 'unknown']} />
      </svg>
      {known ? STATUS_LABELS[known] : status}
    </span>
  )
}
