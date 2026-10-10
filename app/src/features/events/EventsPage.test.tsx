import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import {
  agentsHandler,
  API,
  makeEvents,
  pagedEventsHandler,
  serverError,
} from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'
import { server } from '../../test/server'

// The list, end to end inside jsdom: real components, real query client and retry
// policy (without the delays), and the network faked with MSW.

const empty = { items: [], nextCursor: null, total: 0 }

describe('event list', () => {
  it('shows the first page of events with the total', async () => {
    server.use(agentsHandler, pagedEventsHandler(makeEvents(3)))
    renderApp()
    const table = await screen.findByRole('table')
    expect(await within(table).findAllByRole('link')).toHaveLength(3)
    expect(screen.getByText('3 events')).toBeInTheDocument()
  })

  it('tells "no match" apart from "no events", and Clear filters resets the URL', async () => {
    server.use(
      agentsHandler,
      http.get(`${API}/events`, () => HttpResponse.json(empty)),
    )
    renderApp('/?status=error')
    expect(await screen.findByText('No events match these filters')).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!)
    expect(window.location.search).toBe('')
    expect(await screen.findByText('No events yet')).toBeInTheDocument()
  })

  it('explains a failure after retrying, and recovers with Try again', async () => {
    let failing = true
    let requests = 0
    server.use(
      agentsHandler,
      http.get(`${API}/events`, () => {
        requests++
        return failing
          ? serverError()
          : HttpResponse.json({ ...empty, items: makeEvents(2), total: 2 })
      }),
    )
    renderApp()
    expect(await screen.findByText('Couldn’t load events')).toBeInTheDocument()
    expect(screen.getByText(/server ran into a problem \(error 500\)/i)).toBeInTheDocument()
    expect(requests).toBe(4) // the first attempt plus three retries

    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('2 events')).toBeInTheDocument()
  })

  it('keeps loaded rows when the next page fails, without retrying forever', async () => {
    const events = makeEvents(6)
    let nextPageFails = true
    let nextPageRequests = 0
    server.use(
      agentsHandler,
      http.get(`${API}/events`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        if (!cursor)
          return HttpResponse.json({ items: events.slice(0, 3), nextCursor: '3', total: 6 })
        nextPageRequests++
        if (nextPageFails) return serverError()
        return HttpResponse.json({ items: events.slice(3), nextCursor: null, total: 6 })
      }),
    )
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Load more events' }))

    expect(await screen.findByText(/Couldn’t load more events/)).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getAllByRole('link')).toHaveLength(3)
    // Three retries, then it waits for the user instead of looping.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(nextPageRequests).toBe(4)

    nextPageFails = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() =>
      expect(within(screen.getByRole('table')).getAllByRole('link')).toHaveLength(6),
    )
    expect(screen.getByText(/That’s everything/)).toBeInTheDocument()
  })

  it('renders hostile strings as plain text', async () => {
    const [event] = makeEvents(1)
    server.use(
      agentsHandler,
      http.get(`${API}/events`, () =>
        HttpResponse.json({
          items: [
            {
              ...event,
              agent: '<img src=x onerror=alert(1)>',
              argsPreview: '<script>alert(1)</script>',
            },
          ],
          nextCursor: null,
          total: 1,
        }),
      ),
    )
    renderApp()
    const table = await screen.findByRole('table')
    expect(await within(table).findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(table.querySelector('img, script')).toBeNull()
  })

  it('debounces search into the URL and sends it to the API', async () => {
    const queries: string[] = []
    server.use(
      agentsHandler,
      http.get(`${API}/events`, ({ request }) => {
        queries.push(new URL(request.url).searchParams.get('q') ?? '')
        return HttpResponse.json({ items: makeEvents(1), nextCursor: null, total: 1 })
      }),
    )
    renderApp()
    await screen.findByRole('table')
    await userEvent.type(screen.getByLabelText('Search events'), 'sql')
    await waitFor(() => expect(window.location.search).toBe('?q=sql'))
    await waitFor(() => expect(queries).toContain('sql'))
    // One request for the final text, not one per keystroke.
    expect(queries.filter((q) => q.startsWith('s'))).toEqual(['sql'])
  })
})
