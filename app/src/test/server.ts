import { setupServer } from 'msw/node'

// Nothing is mocked by default: each test registers exactly the responses it needs with
// server.use(), and any request it didn't plan for fails loudly (see setup.ts).
export const server = setupServer()
