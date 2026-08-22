import { describe, it, expect } from 'vitest'
import { COUNTRIES } from './countries'

describe('COUNTRIES', () => {
  it('includes Japan with the correct ISO code', () => {
    expect(COUNTRIES).toContainEqual({ code: 'JP', name: 'Japan' })
  })

  it('has no duplicate codes', () => {
    const codes = COUNTRIES.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('uses 2-letter uppercase ISO codes', () => {
    for (const country of COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/)
    }
  })

  it('is sorted alphabetically by name', () => {
    const names = COUNTRIES.map((c) => c.name)
    const sorted = [...names].sort((a, b) => a.localeCompare(b))
    expect(names).toEqual(sorted)
  })
})
