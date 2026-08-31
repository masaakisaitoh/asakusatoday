import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import TrainStatusCard from './TrainStatusCard.vue'
import { useArticleLocale } from '../composables/useArticleLocale'
import { useUiText } from '../composables/useUiText'
import type { TrainLineStatus } from '../server/utils/trainStatus'

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

const allNormal: TrainLineStatus[] = [
  { lineId: 'ginza', lineName: 'Ginza Line', status: 'normal' },
  { lineId: 'hibiya', lineName: 'Hibiya Line', status: 'normal' },
  { lineId: 'asakusa', lineName: 'Asakusa Line', status: 'normal' },
  { lineId: 'oedo', lineName: 'Oedo Line', status: 'normal' },
  { lineId: 'tx', lineName: 'Tsukuba Express', status: 'normal' }
]

describe('TrainStatusCard', () => {
  it('shows the all-normal message when all 5 lines are normal', () => {
    const wrapper = mount(TrainStatusCard, {
      props: { lines: allNormal },
      global: { stubs }
    })
    expect(wrapper.text()).toContain('All lines running normally.')
    expect(wrapper.text()).not.toContain('Ginza Line')
  })

  it('lists only the non-normal lines when some are disrupted', () => {
    const lines: TrainLineStatus[] = [
      ...allNormal.slice(0, 4),
      { lineId: 'tx', lineName: 'Tsukuba Express', status: 'delayed' }
    ]
    const wrapper = mount(TrainStatusCard, {
      props: { lines },
      global: { stubs }
    })
    expect(wrapper.text()).toContain('Tsukuba Express')
    expect(wrapper.text()).toContain('Delayed')
    expect(wrapper.text()).not.toContain('Ginza Line')
    expect(wrapper.text()).not.toContain('All lines running normally.')
  })

  it('renders nothing when data is partial with no disruption', () => {
    const wrapper = mount(TrainStatusCard, {
      props: { lines: allNormal.slice(0, 2) },
      global: { stubs }
    })
    expect(wrapper.text().trim()).toBe('')
  })
})
