// Pin the timezone so UTC->local rendering is deterministic in CI.
// 2026-07-13T04:03Z is expected to render as Jul 12 (evening) in this zone.
process.env.TZ = 'America/Los_Angeles'

import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
