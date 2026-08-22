import type { TranslationLocale } from '../server/utils/articles'
import { SUPPORTED_LOCALES } from '../server/utils/articles'

const STORAGE_KEY = 'locale'

export function useArticleLocale() {
  const locale = useState<TranslationLocale>('locale', () => 'en')

  function setLocale(value: TranslationLocale): void {
    locale.value = value
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, value)
    }
  }

  function loadStoredLocale(): void {
    if (typeof localStorage === 'undefined') return
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (SUPPORTED_LOCALES as string[]).includes(stored)) {
      locale.value = stored as TranslationLocale
    }
  }

  return { locale, setLocale, loadStoredLocale }
}
