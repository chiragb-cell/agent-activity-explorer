import type { ReactNode } from 'react'
import { cx } from '../lib/cx'
import styles from './StateMessage.module.css'

interface StateMessageProps {
  title: string
  children?: ReactNode
  /** Usually one or two buttons, e.g. "Try again" or "Clear filters". */
  actions?: ReactNode
  tone?: 'neutral' | 'error'
  /** Set `role="alert"` only where no other live region announces the same state. */
  role?: 'alert' | 'status'
  className?: string
}

/** The shared empty / error / not-found message: a title, a sentence, and what to do next. */
export function StateMessage({
  title,
  children,
  actions,
  tone = 'neutral',
  role,
  className,
}: StateMessageProps) {
  return (
    <div className={cx(styles.state, styles[tone], className)} role={role}>
      <p className={styles.title}>{title}</p>
      {children ? <p className={styles.body}>{children}</p> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  )
}
