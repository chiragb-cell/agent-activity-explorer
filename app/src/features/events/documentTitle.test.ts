// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { EMPTY_VIEW } from '../../url/view'
import { documentTitle } from './documentTitle'

describe('documentTitle', () => {
  it('names the app alone for the default view', () => {
    expect(documentTitle(EMPTY_VIEW)).toBe('Agent Activity')
  })

  it('summarises filters and the open event', () => {
    expect(
      documentTitle({ q: 'refund', status: 'error', agents: ['billing-assistant'], event: null }),
    ).toBe('“refund”, Error, billing-assistant · Agent Activity')
    expect(documentTitle({ ...EMPTY_VIEW, agents: ['a', 'b'], event: 'evt_1' })).toBe(
      'Event evt_1 · 2 agents · Agent Activity',
    )
  })
})
