import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { ref } from 'vue'

beforeEach(() => {
  const stateCache = new Map()
  vi.stubGlobal('useState', (_key: string, init: () => unknown) => {
    if (!stateCache.has(_key)) {
      stateCache.set(_key, ref(init()))
    }
    return stateCache.get(_key)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useUiText', () => {
  it('returns the English string for a key when locale is en', async () => {
    const { useArticleLocale } = await import('./useArticleLocale')
    vi.stubGlobal('useArticleLocale', useArticleLocale)
    const { useUiText } = await import('./useUiText')

    const { t } = useUiText()
    expect(t('nav.logIn')).toBe('Log in')
  })

  it('returns the Japanese string for the same key when locale is ja', async () => {
    const { useArticleLocale } = await import('./useArticleLocale')
    vi.stubGlobal('useArticleLocale', useArticleLocale)
    const { useUiText } = await import('./useUiText')

    const { locale, setLocale } = useArticleLocale()
    setLocale('ja')
    const { t } = useUiText()
    expect(locale.value).toBe('ja')
    expect(t('nav.logIn')).toBe('ログイン')
  })

  it('substitutes {name}-style placeholders from params', async () => {
    const { useArticleLocale } = await import('./useArticleLocale')
    vi.stubGlobal('useArticleLocale', useArticleLocale)
    const { useUiText } = await import('./useUiText')

    const { t } = useUiText()
    expect(t('weather.summary', { temp: 29, pop: 30 })).toBe('High 29°C · Rain 30%')
  })
})
