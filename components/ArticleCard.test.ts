import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import ArticleCard from './ArticleCard.vue'
import { useArticleLocale } from '../composables/useArticleLocale'
import { useUiText } from '../composables/useUiText'

const stubs = {
  NuxtLink: { template: '<a><slot /></a>' },
  UCard: { template: '<div><slot name="header" /><slot /></div>' },
  UBadge: { template: '<span><slot /></span>' }
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

describe('ArticleCard', () => {
  it('renders the title and published date', () => {
    const wrapper = mount(ArticleCard, {
      props: { id: 1, title: 'テスト記事', publishedAt: '2026-08-14', category: 'asakusa-area', imageUrl: null },
      global: { stubs }
    })
    expect(wrapper.text()).toContain('テスト記事')
    expect(wrapper.text()).toContain('2026-08-14')
  })

  it('renders an image when imageUrl is provided', () => {
    const wrapper = mount(ArticleCard, {
      props: {
        id: 1,
        title: 'テスト記事',
        publishedAt: '2026-08-14',
        category: 'asakusa-area',
        imageUrl: 'https://example.com/a.jpg'
      },
      global: { stubs }
    })
    expect(wrapper.find('img').exists()).toBe(true)
  })

  it('does not render an image when imageUrl is absent', () => {
    const wrapper = mount(ArticleCard, {
      props: { id: 1, title: 'テスト記事', publishedAt: '2026-08-14', category: 'asakusa-area' },
      global: { stubs }
    })
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('renders the category as a localized tag', () => {
    const wrapper = mount(ArticleCard, {
      props: { id: 1, title: 'テスト記事', publishedAt: '2026-08-14', category: 'ryogoku-area' },
      global: { stubs }
    })
    expect(wrapper.text()).toContain('Ryogoku Area')
  })

  it('navigates to the category filter when the tag is clicked, without following the card link', async () => {
    const navigateToSpy = vi.fn()
    vi.stubGlobal('navigateTo', navigateToSpy)
    const wrapper = mount(ArticleCard, {
      props: { id: 1, title: 'テスト記事', publishedAt: '2026-08-14', category: 'kuramae-area' },
      global: { stubs }
    })

    await wrapper.get('span').trigger('click')

    expect(navigateToSpy).toHaveBeenCalledWith({ path: '/', query: { category: 'kuramae-area' } })
  })
})
