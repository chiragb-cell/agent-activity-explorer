// A JSON value (event args or result) as pretty-printed, inert text.
//
// The brief says args "can be large". Laying out a huge <pre> blocks the main thread,
// so very long values are cut off with an explicit "Show all"; copying always copies
// everything. Nothing is ever interpreted as HTML or turned into a link: payloads
// deliberately contain hostile strings.

import { useId, useMemo, useState } from 'react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { format } from '../../lib/format'
import { JSON_PREVIEW_CHARS, toPrettyJson } from './json'
import styles from './JsonBlock.module.css'

export function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const headingId = useId()
  const text = useMemo(() => toPrettyJson(value), [value])
  const [showAll, setShowAll] = useState(false)
  const truncated = !showAll && text.length > JSON_PREVIEW_CHARS

  return (
    <div className={styles.block}>
      <div className={styles.header}>
        <h3 id={headingId} className={styles.title}>
          {label}
        </h3>
        <CopyButton text={text} label={`Copy ${label.toLowerCase()} as JSON`} />
      </div>
      {/* A scrollable box must be reachable by keyboard (WCAG 2.1.1; axe's
          scrollable-region-focusable), so it is a focusable, named region. The linter
          doesn't treat a named <section> as a region, hence the one exception. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <section className={styles.scroll} aria-labelledby={headingId} tabIndex={0}>
        <pre className={styles.pre}>
          <code>{truncated ? text.slice(0, JSON_PREVIEW_CHARS) : text}</code>
        </pre>
      </section>
      {truncated ? (
        <Button size="sm" onClick={() => setShowAll(true)}>
          Show all ({format.count(text.length)} characters)
        </Button>
      ) : null}
    </div>
  )
}
