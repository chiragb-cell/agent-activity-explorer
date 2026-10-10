import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { agentsHandler, API, detailOf, makeEvents, pagedEventsHandler } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

describe('event detail panel', () => {
  it('opens from a row, shows the full event, and Escape closes it back to the row', async () => {
    const events = makeEvents(3)
    const blocked = events[1]!
    server.use(
      agentsHandler,
      pagedEventsHandler(events),
      http.get(`${API}/events/:id`, ({ params }) => {
        const event = events.find((e) => e.id === params.id)
        return event
          ? HttpResponse.json(detailOf(event))
          : HttpResponse.json({ error: 'event not found' }, { status: 404 })
      }),
    )
    renderApp()
    const table = await screen.findByRole('table')
    const link = (await within(table).findAllByRole('link'))[1]!
    await userEvent.click(link)

    expect(window.location.search).toBe(`?event=${blocked.id}`)
    const panel = await screen.findByRole('complementary')
    expect(await within(panel).findByText('Arguments')).toBeInTheDocument()
    expect(within(panel).getByText('secrets.leak')).toBeInTheDocument()
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(window.location.search).toBe(''))
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument())
    expect(document.activeElement).toBe(link)
  })

  it('says "Event not found" for a deep link to a missing event, after one request', async () => {
    let detailRequests = 0
    server.use(
      agentsHandler,
      pagedEventsHandler(makeEvents(2)),
      http.get(`${API}/events/:id`, () => {
        detailRequests++
        return HttpResponse.json({ error: 'event not found' }, { status: 404 })
      }),
    )
    renderApp('/?event=evt_missing')
    expect(await screen.findByText('Event not found')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(detailRequests).toBe(1)
  })
})
