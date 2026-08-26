import type { TranslationLocale } from '../../server/utils/articles'
import type { PinCategory } from '../mapPins'

export const MAP_PIN_CATEGORY_LABELS: Record<TranslationLocale, Record<PinCategory, string>> = {
  en: {
    spot: 'Sightseeing Spot',
    restaurant: 'Restaurant',
    shopping: 'Shopping',
    toilet: 'Restroom',
    event: 'Event Venue',
    other: 'Other'
  },
  ja: {
    spot: '観光スポット',
    restaurant: '飲食店',
    shopping: 'ショッピング',
    toilet: 'トイレ',
    event: 'イベント会場',
    other: 'その他'
  },
  ko: {
    spot: '관광 명소',
    restaurant: '음식점',
    shopping: '쇼핑',
    toilet: '화장실',
    event: '이벤트 장소',
    other: '기타'
  },
  'zh-Hant': {
    spot: '觀光景點',
    restaurant: '餐飲店',
    shopping: '購物',
    toilet: '洗手間',
    event: '活動會場',
    other: '其他'
  },
  'zh-Hans': {
    spot: '观光景点',
    restaurant: '餐饮店',
    shopping: '购物',
    toilet: '洗手间',
    event: '活动场地',
    other: '其他'
  },
  pt: {
    spot: 'Ponto Turístico',
    restaurant: 'Restaurante',
    shopping: 'Compras',
    toilet: 'Banheiro',
    event: 'Local de Evento',
    other: 'Outro'
  }
}

export function mapPinCategoryLabelFor(locale: TranslationLocale, category: PinCategory): string {
  return MAP_PIN_CATEGORY_LABELS[locale][category]
}
