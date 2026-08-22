import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import WeatherCard from './WeatherCard.vue'
import { useArticleLocale } from '../composables/useArticleLocale'
import { useUiText } from '../composables/useUiText'

const stubs = {
  UCard: { template: '<div><slot /></div>' }
}

beforeEach(() => {
  const stateCache = new Map()
  vi.stubGlobal('useState', (_key: string, init: () => unknown) => {
    if (!stateCache.has(_key)) {
      stateCache.set(_key, ref(init()))
    }
    return stateCache.get(_key)
  })
  vi.stubGlobal('useArticleLocale', useArticleLocale)
  vi.stubGlobal('useUiText', useUiText)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WeatherCard', () => {
  it('renders the weather label, high temp, and pop', () => {
    const wrapper = mount(WeatherCard, {
      props: { weatherEmoji: '☁️', weatherLabel: 'Cloudy', pop: 30, highTemp: 29 },
      global: { stubs }
    })
    expect(wrapper.text()).toContain('Cloudy')
    expect(wrapper.text()).toContain('High 29°C')
    expect(wrapper.text()).toContain('Rain 30%')
  })

  it('renders the weather emoji', () => {
    const wrapper = mount(WeatherCard, {
      props: { weatherEmoji: '☀️', weatherLabel: 'Sunny', pop: 0, highTemp: 31 },
      global: { stubs }
    })
    expect(wrapper.text()).toContain('☀️')
  })
})
