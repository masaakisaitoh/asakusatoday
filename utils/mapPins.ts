export const PIN_CATEGORIES = ['spot', 'restaurant', 'shopping', 'toilet', 'event', 'other'] as const
export type PinCategory = (typeof PIN_CATEGORIES)[number]

export const PIN_ICONS = [
  'lucide:map-pin',
  'lucide:landmark',
  'lucide:utensils',
  'lucide:coffee',
  'lucide:shopping-bag',
  'lucide:toilet',
  'lucide:ticket',
  'lucide:tent',
  'lucide:camera',
  'lucide:car',
  'lucide:train-front',
  'lucide:info'
] as const
export type PinIcon = (typeof PIN_ICONS)[number]

export interface MapPin {
  id: number
  name: string
  description: string
  category: PinCategory
  icon: PinIcon
  lat: number
  lng: number
  created_at: string
}
