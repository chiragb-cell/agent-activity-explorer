// How each kind of navigation should touch the browser history. Pure, so the policy is
// unit-tested as a table rather than discovered by clicking around.
//
// - Filter changes push, so Back undoes them one at a time.
// - Search edits collapse: the first edit pushes an entry marked `search`, later edits
//   replace it. One Back undoes a whole typing burst, and no timers are involved.
// - Opening the panel pushes an entry marked `panel`; switching events while it's open
//   replaces. Closing goes Back when this entry opened the panel, so Back and Forward
//   stay symmetrical. Otherwise (a deep link, or filters changed since) closing replaces,
//   because going Back from a deep link would leave the app.

export type EntryKind = 'search' | 'filter' | 'panel'

export interface EntryState {
  kind: EntryKind
}

export type Navigation =
  | { type: 'search' }
  | { type: 'filter' }
  | { type: 'open-event'; panelAlreadyOpen: boolean }
  | { type: 'close-event' }

export type HistoryAction =
  { method: 'push' | 'replace'; state: EntryState | null } | { method: 'back' }

/** Reads our marker from `history.state`, tolerating anything else that may be stored there. */
export function readEntryKind(state: unknown): EntryKind | null {
  if (typeof state !== 'object' || state === null || !('kind' in state)) return null
  const { kind } = state
  return kind === 'search' || kind === 'filter' || kind === 'panel' ? kind : null
}

export function planHistory(navigation: Navigation, currentState: unknown): HistoryAction {
  const current = readEntryKind(currentState)
  const keepCurrent: EntryState | null = current ? { kind: current } : null

  switch (navigation.type) {
    case 'search':
      return { method: current === 'search' ? 'replace' : 'push', state: { kind: 'search' } }
    case 'filter':
      return { method: 'push', state: { kind: 'filter' } }
    case 'open-event':
      return navigation.panelAlreadyOpen
        ? { method: 'replace', state: keepCurrent }
        : { method: 'push', state: { kind: 'panel' } }
    case 'close-event':
      return current === 'panel' ? { method: 'back' } : { method: 'replace', state: keepCurrent }
  }
}
