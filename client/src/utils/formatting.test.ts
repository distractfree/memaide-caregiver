import { describe, expect, it } from 'vitest'
import { formatDateTime } from './formatting'

// The test suite pins TZ to America/Los_Angeles (see src/test/setup.ts).
describe('formatDateTime', () => {
  it('renders a UTC ISO timestamp in the local timezone', () => {
    // 04:03 UTC on Jul 13 is 21:03 (9:03 PM) on Jul 12 in Los Angeles (UTC-7).
    const formatted = formatDateTime('2026-07-13T04:03:07.603Z')
    expect(formatted).toContain('Jul 12')
    expect(formatted).toContain('9:03')
  })

  it('does not shift a record across days by manual offset math', () => {
    // 2026-07-13T04:07Z -> Jul 12 evening locally; must not read Jul 13.
    const formatted = formatDateTime('2026-07-13T04:07:34.020Z')
    expect(formatted).toContain('Jul 12')
    expect(formatted).not.toContain('Jul 13')
  })

  it('matches the browser Intl local formatting exactly (no manual math)', () => {
    const iso = '2026-07-13T04:03:07.603Z'
    const expected = new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    expect(formatDateTime(iso)).toBe(expected)
  })

  it('returns an em dash for empty input', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime(undefined)).toBe('—')
  })
})
