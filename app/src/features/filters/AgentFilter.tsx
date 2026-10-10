// Agent filter: a disclosure button that opens a filterable checkbox list.
//
// Native checkboxes in a fieldset give correct semantics and keyboard behaviour for
// free. A plain absolutely-positioned panel is enough for ~a dozen agents; it closes on
// Escape (returning focus to the button) or on a click outside.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { explainError } from '../../api/errors'
import { useAgents } from '../../api/queries'
import { Button } from '../../components/Button'
import { setAgents } from '../../url/useView'
import styles from './AgentFilter.module.css'

export function AgentFilter({ selected }: { selected: string[] }) {
  const [open, setOpen] = useState(false)
  const [filterText, setFilterText] = useState('')
  const agents = useAgents()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const panelId = useId()

  // Agents named in the URL stay listed even if /agents fails or no longer returns them,
  // so they can always be unticked.
  const options = useMemo(
    () => [...new Set([...(agents.data ?? []), ...selected])].sort(),
    [agents.data, selected],
  )
  const needle = filterText.trim().toLowerCase()
  const visible = needle ? options.filter((agent) => agent.toLowerCase().includes(needle)) : options

  useEffect(() => {
    if (!open) return
    filterRef.current?.focus()
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function close() {
    setOpen(false)
    buttonRef.current?.focus()
  }

  function toggle(agent: string) {
    setAgents(selected.includes(agent) ? selected.filter((a) => a !== agent) : [...selected, agent])
  }

  return (
    // The wrapper only catches Escape bubbling up from the panel's own controls.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={wrapperRef}
      className={styles.wrapper}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        // Handled here, so it must not also close the detail panel behind it.
        event.preventDefault()
        event.stopPropagation()
        close()
      }}
    >
      <Button
        ref={buttonRef}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        Agents
        {selected.length > 0 ? (
          <span className={styles.count}>
            {selected.length}
            <span className="visually-hidden"> selected</span>
          </span>
        ) : null}
        <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </Button>

      {open ? (
        <div id={panelId} className={styles.panel}>
          <label className="visually-hidden" htmlFor={`${panelId}-filter`}>
            Find an agent
          </label>
          <input
            ref={filterRef}
            id={`${panelId}-filter`}
            className={styles.filter}
            type="search"
            placeholder="Find an agent"
            autoComplete="off"
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
          />

          {agents.isPending ? <p className={styles.note}>Loading agents…</p> : null}
          {agents.isError ? (
            <div className={styles.note}>
              <p className={styles.error}>
                Couldn’t load agents. {explainError(agents.error).message}
              </p>
              <Button size="sm" onClick={() => void agents.refetch()}>
                Try again
              </Button>
            </div>
          ) : null}

          {visible.length > 0 ? (
            <fieldset className={styles.options}>
              <legend className="visually-hidden">Agents</legend>
              {visible.map((agent) => (
                <label key={agent} className={styles.option}>
                  <input
                    type="checkbox"
                    checked={selected.includes(agent)}
                    onChange={() => toggle(agent)}
                  />
                  <span className={styles.optionLabel}>{agent}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          {agents.isSuccess && visible.length === 0 ? (
            <p className={styles.note}>
              {options.length === 0 ? 'No agents yet.' : `No agents match “${filterText}”.`}
            </p>
          ) : null}

          <div className={styles.actions}>
            <Button
              size="sm"
              variant="ghost"
              disabled={selected.length === 0}
              onClick={() => setAgents([])}
            >
              Clear
            </Button>
            <Button size="sm" variant="primary" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
