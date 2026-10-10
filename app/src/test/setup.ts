import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest doesn't expose test globals here, so Testing Library can't register its
// own auto-cleanup; unmount explicitly so DOM state never leaks between tests.
afterEach(() => cleanup())
