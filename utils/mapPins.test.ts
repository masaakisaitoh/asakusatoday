import { describe, it, expect } from 'vitest'

describe('mapPins constants', () => {
  it('defines exactly 6 pin categories', async () => {
    const { PIN_CATEGORIES } = await import('./mapPins')
    expect(PIN_CATEGORIES).toEqual(['spot', 'restaurant', 'shopping', 'toilet', 'event', 'other'])
  })

  it('defines exactly 12 pin icons in iconify colon format', async () => {
    const { PIN_ICONS } = await import('./mapPins')
    expect(PIN_ICONS).toHaveLength(12)
    for (const icon of PIN_ICONS) {
      expect(icon).toMatch(/^lucide:[a-z-]+$/)
    }
  })
})
