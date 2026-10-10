// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { planHistory, readEntryKind, type HistoryAction, type Navigation } from './history'

describe('planHistory', () => {
  const cases: Array<[string, Navigation, unknown, HistoryAction]> = [
    [
      'first search edit pushes a search entry',
      { type: 'search' },
      null,
      { method: 'push', state: { kind: 'search' } },
    ],
    [
      'later search edits replace it (one Back undoes the burst)',
      { type: 'search' },
      { kind: 'search' },
      { method: 'replace', state: { kind: 'search' } },
    ],
    [
      'a search after a filter change pushes',
      { type: 'search' },
      { kind: 'filter' },
      { method: 'push', state: { kind: 'search' } },
    ],
    [
      'filter changes always push',
      { type: 'filter' },
      { kind: 'filter' },
      { method: 'push', state: { kind: 'filter' } },
    ],
    [
      'opening the panel pushes a panel entry',
      { type: 'open-event', panelAlreadyOpen: false },
      { kind: 'search' },
      { method: 'push', state: { kind: 'panel' } },
    ],
    [
      'switching events in an open panel replaces and keeps the marker',
      { type: 'open-event', panelAlreadyOpen: true },
      { kind: 'panel' },
      { method: 'replace', state: { kind: 'panel' } },
    ],
    [
      'closing a panel this entry opened goes Back',
      { type: 'close-event' },
      { kind: 'panel' },
      { method: 'back' },
    ],
    [
      'closing a deep-linked panel replaces (Back would leave the app)',
      { type: 'close-event' },
      null,
      { method: 'replace', state: null },
    ],
    [
      'closing after a filter change replaces and keeps that entry',
      { type: 'close-event' },
      { kind: 'filter' },
      { method: 'replace', state: { kind: 'filter' } },
    ],
  ]

  it.each(cases)('%s', (_name, navigation, state, expected) => {
    expect(planHistory(navigation, state)).toEqual(expected)
  })
})

describe('readEntryKind', () => {
  it('ignores history state that is not ours', () => {
    expect(readEntryKind(undefined)).toBeNull()
    expect(readEntryKind('panel')).toBeNull()
    expect(readEntryKind({ kind: 'other' })).toBeNull()
    expect(readEntryKind({ key: 'set-by-another-library' })).toBeNull()
  })
})
