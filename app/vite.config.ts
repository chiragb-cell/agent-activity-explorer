/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Fail loudly instead of drifting to 5174, which is the perf-clinic's port.
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Playwright owns ./e2e; Vitest only picks up unit and component tests.
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
