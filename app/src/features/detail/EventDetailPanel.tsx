// The detail panel: everything about one event, driven purely by `?event=` in the URL,
// so it is linkable, survives a refresh and works with Back/Forward.
//
// The row's data from the list shows instantly; the full event (args, result, policy
// matches) loads behind it. Escape closes it from anywhere except text fields.

import { useEffect, useId, useRef } from 'react'
import { explainError } from '../../api/errors'
import { useEventDetail } from '../../api/queries'
import { MAX_RETRIES } from '../../api/retry'
import type { EventDetail, EventSummary } from '../../api/schemas'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { LiveRegion } from '../../components/LiveRegion'
import { StateMessage } from '../../components/StateMessage'
import { StatusBadge } from '../../components/StatusBadge'
import { useDelayedFlag } from '../../hooks/useDelayedFlag'
import { isTextEntry } from '../../lib/dom'
import { format } from '../../lib/format'
import { JsonBlock } from './JsonBlock'
import styles from './EventDetailPanel.module.css'

interface EventDetailPanelProps {
  id: string
  /** The event's row from the list, if it's loaded: shown while the full event loads. */
  summary: EventSummary | undefined
  onClose: () => void
}

export function EventDetailPanel({ id, summary, onClose }: EventDetailPanelProps) {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const detail = useEventDetail(id)
  const event = detail.data ?? summary
  const slow = useDelayedFlag(detail.isFetching, 2000)

  // Move focus to the heading when the panel opens, so screen readers announce the event
  // and Tab continues inside the panel. EventsPage keys the panel by event id, so this
  // runs once per event, including when switching between events.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  // When the panel closes while focus is inside it, the focused element disappears and
  // focus would fall to <body>; send it back to the row the event came from instead.
  useEffect(
    () => () => {
      if (document.activeElement && document.activeElement !== document.body) return
      document.querySelector<HTMLElement>(`[data-event-link="${CSS.escape(id)}"]`)?.focus()
    },
    [id],
  )

  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key !== 'Escape' || keyEvent.defaultPrevented) return
      // In a text field Escape belongs to the field (e.g. clearing a search).
      if (isTextEntry(keyEvent.target)) return
      keyEvent.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const notFound = detail.isError && explainError(detail.error).notFound

  return (
    <aside className={styles.panel} aria-labelledby={headingId}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.title}>
            {event ? event.tool : 'Event details'}
          </h2>
          {event ? <p className={styles.subtitle}>by {event.agent}</p> : null}
        </div>
        <CopyButton
          text={window.location.href}
          label="Copy link to this event"
          idleText="Copy link"
        />
        <Button
          size="sm"
          variant="ghost"
          className={styles.close}
          aria-label="Close details"
          aria-keyshortcuts="Escape"
          onClick={onClose}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </Button>
      </header>

      <div className={styles.body}>
        {notFound ? (
          <StateMessage
            title="Event not found"
            actions={<Button onClick={onClose}>Close panel</Button>}
          >
            There’s no event with ID {id}. It may have been removed, or the link may be wrong.
          </StateMessage>
        ) : (
          <>
            {event ? <Overview event={event} policyMatches={detail.data?.policyMatches} /> : null}
            <Progress detail={detail} slow={slow} hasSummary={Boolean(event)} />
            {detail.isError ? (
              <StateMessage
                title="Couldn’t load this event"
                tone="error"
                actions={
                  explainError(detail.error).canRetry ? (
                    <Button variant="primary" onClick={() => void detail.refetch()}>
                      Try again
                    </Button>
                  ) : null
                }
              >
                {explainError(detail.error).message}
              </StateMessage>
            ) : null}
            {detail.data ? (
              <>
                <JsonBlock label="Arguments" value={detail.data.args} />
                <JsonBlock label="Result" value={detail.data.result} />
              </>
            ) : null}
          </>
        )}
      </div>

      <LiveRegion message={panelAnnouncement(detail, notFound)} />
    </aside>
  )
}

function Overview({
  event,
  policyMatches,
}: {
  event: EventSummary | EventDetail
  policyMatches: string[] | undefined
}) {
  return (
    <dl className={styles.overview}>
      <dt>Status</dt>
      <dd>
        <StatusBadge status={event.status} />
      </dd>
      <dt>Time</dt>
      <dd>
        <time dateTime={event.timestamp}>{format.fullTime(event.timestamp)}</time>
        <span className={styles.secondary}>{event.timestamp} (UTC)</span>
      </dd>
      <dt>Agent</dt>
      <dd>{event.agent}</dd>
      <dt>Tool</dt>
      <dd className={styles.mono}>{event.tool}</dd>
      <dt>Latency</dt>
      <dd>{format.latency(event.latencyMs)}</dd>
      <dt>Event ID</dt>
      <dd className={styles.idRow}>
        <span className={styles.mono}>{event.id}</span>
        <CopyButton text={event.id} label="Copy event ID" />
      </dd>
      <dt>Policy matches</dt>
      <dd>
        {policyMatches === undefined ? (
          <span className={styles.secondary}>Loading…</span>
        ) : policyMatches.length === 0 ? (
          <span className={styles.secondary}>None</span>
        ) : (
          <ul className={styles.policies}>
            {policyMatches.map((rule) => (
              <li key={rule} className={styles.policy}>
                {rule}
              </li>
            ))}
          </ul>
        )}
      </dd>
    </dl>
  )
}

type DetailQuery = ReturnType<typeof useEventDetail>

function Progress({
  detail,
  slow,
  hasSummary,
}: {
  detail: DetailQuery
  slow: boolean
  hasSummary: boolean
}) {
  if (!detail.isFetching) return null
  let text = hasSummary ? 'Loading arguments and result…' : 'Loading event…'
  if (detail.failureCount > 0) {
    text = `The server returned an error. Retrying (attempt ${detail.failureCount + 1} of ${MAX_RETRIES + 1})…`
  } else if (slow) {
    text = 'Still loading. The server is responding slowly.'
  }
  return (
    <p className={styles.progress}>
      <span className={styles.spinner} aria-hidden="true" />
      {text}
    </p>
  )
}

function panelAnnouncement(detail: DetailQuery, notFound: boolean) {
  if (notFound) return 'Event not found.'
  if (detail.isError) return 'Couldn’t load this event.'
  if (detail.isPending) return 'Loading event details…'
  return ''
}
