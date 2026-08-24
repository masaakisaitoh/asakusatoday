import { describe, it, expect } from 'vitest'
import { truncateForDescription, safeJsonLd, toIso8601 } from './seo'

describe('truncateForDescription', () => {
  it('returns the string unchanged when at or under the limit', () => {
    expect(truncateForDescription('short text', 155)).toBe('short text')
  })

  it('truncates at a word boundary and appends an ellipsis when over the limit', () => {
    const body = `${'a'.repeat(100)} ${'b'.repeat(100)}`
    const result = truncateForDescription(body, 105)
    expect(result.length).toBeLessThanOrEqual(106)
    expect(result.endsWith('…')).toBe(true)
    expect(result.startsWith('a'.repeat(100))).toBe(true)
  })

  it('collapses newlines and repeated whitespace into single spaces', () => {
    expect(truncateForDescription('line one\n\nline   two', 155)).toBe('line one line two')
  })

  it('uses 155 as the default max length', () => {
    const body = 'x'.repeat(200)
    const result = truncateForDescription(body)
    expect(result.length).toBeLessThanOrEqual(156)
  })
})

describe('safeJsonLd', () => {
  it('escapes < characters so </script> cannot appear literally', () => {
    const result = safeJsonLd({ headline: 'Breaking </script><script>alert(1)</script>' })
    expect(result).not.toContain('</script>')
    expect(result).toContain('\\u003c/script>')
  })

  it('produces valid JSON once the escape is reversed', () => {
    const value = { a: 1, b: 'text' }
    const result = safeJsonLd(value)
    expect(JSON.parse(result.replace(/\\u003c/g, '<'))).toEqual(value)
  })
})

describe('toIso8601', () => {
  it('converts a typical SQLite datetime string to ISO 8601', () => {
    expect(toIso8601('2026-08-20 09:00:00')).toBe('2026-08-20T09:00:00Z')
  })

  it('returns undefined for null input', () => {
    expect(toIso8601(null)).toBeUndefined()
  })
})
