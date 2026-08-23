import type { UiStringKey } from '../utils/i18n/uiStrings'
import { UI_STRINGS } from '../utils/i18n/uiStrings'
import { categoryLabelFor } from '../utils/i18n/categoryLabels'

export function useUiText() {
  const { locale } = useArticleLocale()

  function t(key: UiStringKey, params?: Record<string, string | number>): string {
    let text = UI_STRINGS[locale.value][key]
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value))
      }
    }
    return text
  }

  function categoryLabel(category: string): string {
    return categoryLabelFor(locale.value, category)
  }

  return { t, categoryLabel }
}
