import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AdBanner from './AdBanner.vue'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AdBanner', () => {
  it('renders separate ad units for mobile and desktop with the given AdSense client', () => {
    const wrapper = mount(AdBanner)
    const ins = wrapper.findAll('ins.adsbygoogle')
    expect(ins).toHaveLength(2)
    for (const el of ins) {
      expect(el.attributes('data-ad-client')).toBe('ca-pub-4995620565805965')
    }
  })

  it('uses distinct ad slots for the mobile and desktop units', () => {
    const wrapper = mount(AdBanner)
    const slots = wrapper.findAll('ins.adsbygoogle').map((el) => el.attributes('data-ad-slot'))
    expect(slots).toEqual(['4197382370', '3896175647'])
  })

  it('pushes one ad request per ad unit on mount', () => {
    const push = vi.fn()
    vi.stubGlobal('window', { ...window, adsbygoogle: { push } })
    mount(AdBanner)
    expect(push).toHaveBeenCalledTimes(2)
  })
})
