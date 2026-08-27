import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref, Suspense } from 'vue'
import ArticlePage from './[id].vue'
import { useArticleLocale } from '../../composables/useArticleLocale'
import { useUiText } from '../../composables/useUiText'

const stubs = {
  NuxtLink: { template: '<a><slot /></a>' },
  UCard: { template: '<div><slot name="header" /><slot /></div>' },
  UBadge: { template: '<span><slot /></span>' }
}

const article = {
  id: 1,
  title: 'Test Article',
  body: 'Body text',
  category: 'traffic',
  published_at: '2026-01-01',
  image_url: null,
  sources: [],
  is_favorited: false,
  favorite_count: 5
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubGlobals() {
  const stateCache = new Map()
  vi.stubGlobal('useState', (key: string, init: () => unknown) => {
    if (!stateCache.has(key)) stateCache.set(key, ref(init()))
    return stateCache.get(key)
  })
  vi.stubGlobal('useRoute', () => ({ params: { id: '1' } }))
  vi.stubGlobal('useArticleLocale', useArticleLocale)
  vi.stubGlobal('useUiText', useUiText)
  vi.stubGlobal('useFetch', (url: string) => {
    if (url === '/api/user/me') return { data: ref(null) }
    return { data: ref({ ...article }), error: ref(null) }
  })
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { siteUrl: 'https://asakusatoday.com' } }))
  vi.stubGlobal('useSeoMeta', vi.fn())
  vi.stubGlobal('useHead', vi.fn())
  vi.stubGlobal('createError', (opts: unknown) => Object.assign(new Error('error'), opts as object))
  vi.stubGlobal('navigateTo', vi.fn())
  vi.stubGlobal('$fetch', vi.fn())
}

function mountSuspended() {
  const wrapped = defineComponent({
    render: () => h(Suspense, null, { default: () => h(ArticlePage) })
  })
  return mount(wrapped, { global: { stubs } })
}

describe('article page', () => {
  it('shows the favorite count next to the heart button', async () => {
    stubGlobals()
    const wrapper = mountSuspended()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('span.text-muted').text()).toBe('5')
  })

  it('updates the favorite count after toggling favorite', async () => {
    stubGlobals()
    vi.stubGlobal('useFetch', (url: string) => {
      if (url === '/api/user/me') return { data: ref({ avatar_seed: 'seed', user_name: 'tester' }) }
      return { data: ref({ ...article }), error: ref(null) }
    })
    const fetchMock = vi.fn().mockResolvedValue({ favorited: true, favorite_count: 42 })
    vi.stubGlobal('$fetch', fetchMock)

    const wrapper = mountSuspended()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    await wrapper.find('button').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('span.text-muted').text()).toBe('42')
  })
})
