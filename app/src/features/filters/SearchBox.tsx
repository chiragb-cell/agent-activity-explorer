// Free-text search. The input keeps a local draft that is debounced into the URL, so
// typing stays instant while the list only refetches once the user pauses.

import { useEffect, useRef, useState } from 'react'
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback'
import { isTextEntry } from '../../lib/dom'
import { onSearchChangedElsewhere, setSearch } from '../../url/useView'
import styles from './SearchBox.module.css'

/** Long enough to skip intermediate keystrokes, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 300

export function SearchBox({ value }: { value: string }) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const commit = useDebouncedCallback(setSearch, SEARCH_DEBOUNCE_MS)

  // Back/Forward, "Clear filters" or removing the chip changed the search: show it, and
  // drop any pending edit so it can't overwrite that navigation (or, after Back, push a
  // new entry and wipe the Forward history).
  useEffect(
    () =>
      onSearchChangedElsewhere((q) => {
        commit.cancel()
        setDraft(q)
      }),
    [commit],
  )

  // "/" focuses search from anywhere on the page, as in many developer tools.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTextEntry(event.target)) return
      event.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <search className={styles.search}>
      <label htmlFor="event-search" className="visually-hidden">
        Search events
      </label>
      <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" />
      </svg>
      <input
        ref={inputRef}
        id="event-search"
        className={styles.input}
        type="search"
        value={draft}
        placeholder="Search agent, tool or arguments"
        autoComplete="off"
        spellCheck={false}
        aria-keyshortcuts="/"
        onChange={(event) => {
          setDraft(event.target.value)
          commit.run(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit.flush()
          // Escape clears the search first; a second Escape (empty box) can then reach
          // whatever is behind it, like the detail panel.
          if (event.key === 'Escape' && draft !== '') {
            event.preventDefault()
            event.stopPropagation()
            commit.cancel()
            setDraft('')
            setSearch('')
          }
        }}
      />
      <kbd className={styles.hint} aria-hidden="true">
        /
      </kbd>
    </search>
  )
}
