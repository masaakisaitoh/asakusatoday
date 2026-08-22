import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ArticleCard from './ArticleCard.vue'

const stubs = {
  NuxtLink: { template: '<a><slot /></a>' },
  UCard: { template: '<div><slot name="header" /><slot /></div>' }
}

describe('ArticleCard', () => {
  it('renders the title and published date', () => {
    const wrapper = mount(ArticleCard, {
      props: { id: 1, title: 'テスト記事', publishedAt: '2026-08-14', imageUrl: null },
      global: { stubs }
    })
    expect(wrapper.text()).toContain('テスト記事')
    expect(wrapper.text()).toContain('2026-08-14')
  })

  it('renders an image when imageUrl is provided', () => {
    const wrapper = mount(ArticleCard, {
      props: { id: 1, title: 'テスト記事', publishedAt: '2026-08-14', imageUrl: 'https://example.com/a.jpg' },
      global: { stubs }
    })
    expect(wrapper.find('img').exists()).toBe(true)
  })

  it('does not render an image when imageUrl is absent', () => {
    const wrapper = mount(ArticleCard, {
      props: { id: 1, title: 'テスト記事', publishedAt: '2026-08-14' },
      global: { stubs }
    })
    expect(wrapper.find('img').exists()).toBe(false)
  })
})
