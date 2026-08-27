import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdBanner from './AdBanner.vue'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia
  )
}

describe('AdBanner', () => {
  it('renders the mobile ad slot below the md breakpoint', async () => {
    stubMatchMedia(false)
    const wrapper = mount(AdBanner)
    await flushPromises()
    const ins = wrapper.findAll('ins.adsbygoogle')
    expect(ins).toHaveLength(1)
    expect(ins[0].attributes('data-ad-client')).toBe('ca-pub-4995620565805965')
    expect(ins[0].attributes('data-ad-slot')).toBe('4197382370')
  })

  it('renders the desktop ad slot at/above the md breakpoint', async () => {
    stubMatchMedia(true)
    const wrapper = mount(AdBanner)
    await flushPromises()
    const ins = wrapper.findAll('ins.adsbygoogle')
    expect(ins).toHaveLength(1)
    expect(ins[0].attributes('data-ad-slot')).toBe('3896175647')
  })

  it('pushes exactly one ad request for the rendered slot', async () => {
    const push = vi.fn()
    vi.stubGlobal('window', {
      ...window,
      adsbygoogle: { push },
      matchMedia: () => ({ matches: true })
    })
    mount(AdBanner)
    await flushPromises()
    expect(push).toHaveBeenCalledTimes(1)
  })
})
