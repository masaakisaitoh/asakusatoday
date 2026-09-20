import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { ref } from 'vue'
import { UI_STRINGS } from '../utils/i18n/uiStrings'

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

  it('returns train status strings for en and ja', async () => {
    const { useArticleLocale } = await import('./useArticleLocale')
    vi.stubGlobal('useArticleLocale', useArticleLocale)
    const { useUiText } = await import('./useUiText')

    const { locale, setLocale } = useArticleLocale()
    const { t } = useUiText()
    expect(t('train.statusSuspended')).toBe('Suspended')

    setLocale('ja')
    expect(locale.value).toBe('ja')
    expect(t('train.statusDelayed')).toBe('遅延')
  })

  it('returns the normal-status and official-link strings for en and ja', async () => {
    const { useArticleLocale } = await import('./useArticleLocale')
    vi.stubGlobal('useArticleLocale', useArticleLocale)
    const { useUiText } = await import('./useUiText')

    const { setLocale } = useArticleLocale()
    const { t } = useUiText()
    expect(t('train.statusNormal')).toBe('Normal')
    expect(t('train.viewOfficial')).toBe('Check official site')

    setLocale('ja')
    expect(t('train.statusNormal')).toBe('平常')
    expect(t('train.viewOfficial')).toBe('公式サイトで確認')
  })

  it('defines the normal-status and official-link strings for every locale', () => {
    for (const [locale, strings] of Object.entries(UI_STRINGS)) {
      expect(strings['train.statusNormal'], locale).toBeTruthy()
      expect(strings['train.viewOfficial'], locale).toBeTruthy()
    }
  })

  it('returns theme option labels for en and ja', async () => {
    const { useArticleLocale } = await import('./useArticleLocale')
    vi.stubGlobal('useArticleLocale', useArticleLocale)
    const { useUiText } = await import('./useUiText')

    const { locale, setLocale } = useArticleLocale()
    const { t } = useUiText()
    expect(t('profile.theme')).toBe('Theme')
    expect(t('profile.themeLight')).toBe('Light')
    expect(t('profile.themeDark')).toBe('Dark')
    expect(t('profile.themeSystem')).toBe('System')

    setLocale('ja')
    expect(locale.value).toBe('ja')
    expect(t('profile.themeDark')).toBe('ダーク')
  })

  it('returns favorites strings for en and ja', async () => {
    const { useArticleLocale } = await import('./useArticleLocale')
    vi.stubGlobal('useArticleLocale', useArticleLocale)
    const { useUiText } = await import('./useUiText')

    const { locale, setLocale } = useArticleLocale()
    const { t } = useUiText()
    expect(t('nav.favorites')).toBe('Favorites')
    expect(t('favorites.title')).toBe('Favorites')
    expect(t('favorites.empty')).toBe('No favorites yet.')
    expect(t('article.addFavorite')).toBe('Add to favorites')
    expect(t('article.removeFavorite')).toBe('Remove from favorites')

    setLocale('ja')
    expect(locale.value).toBe('ja')
    expect(t('nav.favorites')).toBe('お気に入り')
    expect(t('favorites.empty')).toBe('まだお気に入りがありません。')
  })
})
