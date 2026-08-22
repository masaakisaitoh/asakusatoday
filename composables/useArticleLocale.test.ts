import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { ref } from 'vue'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('useState', (_key: string, init: () => unknown) => ref(init()))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useArticleLocale', () => {
  it('defaults to en', async () => {
    const { useArticleLocale } = await import('./useArticleLocale')
    const { locale } = useArticleLocale()
    expect(locale.value).toBe('en')
  })

  it('setLocale updates the state and persists to localStorage', async () => {
    const { useArticleLocale } = await import('./useArticleLocale')
    const { locale, setLocale } = useArticleLocale()
    setLocale('ja')
    expect(locale.value).toBe('ja')
    expect(localStorage.getItem('locale')).toBe('ja')
  })

  it('loadStoredLocale reads a valid persisted value', async () => {
    localStorage.setItem('locale', 'ko')
    const { useArticleLocale } = await import('./useArticleLocale')
    const { locale, loadStoredLocale } = useArticleLocale()
    loadStoredLocale()
    expect(locale.value).toBe('ko')
  })

  it('loadStoredLocale ignores an invalid persisted value', async () => {
    localStorage.setItem('locale', 'fr')
    const { useArticleLocale } = await import('./useArticleLocale')
    const { locale, loadStoredLocale } = useArticleLocale()
    loadStoredLocale()
    expect(locale.value).toBe('en')
  })
})
