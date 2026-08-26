import { describe, it, expect } from 'vitest'

describe('mapPinCategoryLabelFor', () => {
  it('returns English labels', async () => {
    const { mapPinCategoryLabelFor } = await import('./mapPinCategoryLabels')
    expect(mapPinCategoryLabelFor('en', 'spot')).toBe('Sightseeing Spot')
    expect(mapPinCategoryLabelFor('en', 'restaurant')).toBe('Restaurant')
    expect(mapPinCategoryLabelFor('en', 'toilet')).toBe('Restroom')
  })

  it('returns Japanese labels', async () => {
    const { mapPinCategoryLabelFor } = await import('./mapPinCategoryLabels')
    expect(mapPinCategoryLabelFor('ja', 'spot')).toBe('観光スポット')
    expect(mapPinCategoryLabelFor('ja', 'other')).toBe('その他')
  })

  it('has labels for all 6 categories in all 6 locales', async () => {
    const { mapPinCategoryLabelFor } = await import('./mapPinCategoryLabels')
    const { PIN_CATEGORIES } = await import('../mapPins')
    const locales = ['ja', 'en', 'ko', 'zh-Hant', 'zh-Hans', 'pt'] as const
    for (const locale of locales) {
      for (const category of PIN_CATEGORIES) {
        expect(mapPinCategoryLabelFor(locale, category)).toBeTruthy()
      }
    }
  })
})
