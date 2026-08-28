import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import DefaultLayout from './default.vue'
import { useArticleLocale } from '../composables/useArticleLocale'
import { useUiText } from '../composables/useUiText'

const stubs = {
  NuxtLink: { template: '<a><slot /></a>' },
  UserAvatar: { template: '<div class="user-avatar-stub" />' },
  UDropdownMenu: {
    props: ['items'],
    computed: { flatItems(): any[] { return (this as any).items.flat() } },
    template:
      '<div class="dropdown-stub"><slot /><ul><li v-for="item in flatItems" :key="item.label" @click="item.onSelect && item.onSelect($event)">{{ item.label }}</li></ul></div>'
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubUseState(
  user: { avatar_seed: string; user_name: string } | null = null,
  path = '/'
) {
  const stateCache = new Map()
  vi.stubGlobal('useState', (_key: string, init: () => unknown) => {
    if (!stateCache.has(_key)) {
      stateCache.set(_key, ref(init()))
    }
    return stateCache.get(_key)
  })
  vi.stubGlobal('useArticleLocale', useArticleLocale)
  vi.stubGlobal('useUiText', useUiText)
  vi.stubGlobal('useFetch', () => ({ data: ref(user) }))
  vi.stubGlobal('useHead', vi.fn())
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { siteUrl: 'https://asakusatoday.com' } }))
  vi.stubGlobal('useRoute', () => ({ path }))
  const fetchMock = vi.fn()
  const navigateMock = vi.fn()
  vi.stubGlobal('$fetch', fetchMock)
  vi.stubGlobal('navigateTo', navigateMock)
  return { fetchMock, navigateMock }
}

describe('default layout', () => {
  it('renders the site logo linking to home', () => {
    stubUseState()
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    expect(wrapper.text()).toContain('ASAKUSA TODAY')
  })

  it('renders the copyright notice in the footer', () => {
    stubUseState()
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    expect(wrapper.find('footer').text()).toContain('© ASAKUSA TODAY')
  })

  it('renders slot content in the main area', () => {
    stubUseState()
    const wrapper = mount(DefaultLayout, {
      slots: { default: '<div class="test-content">Hello</div>' },
      global: { stubs }
    })
    expect(wrapper.find('.test-content').exists()).toBe(true)
  })

  it('renders a language selector with all supported locales', () => {
    stubUseState()
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    const options = wrapper.findAll('option')
    expect(options.map((o) => o.attributes('value'))).toEqual(['ja', 'en', 'ko', 'zh-Hant', 'zh-Hans', 'pt'])
  })

  it('changing the language selector updates the selected locale', async () => {
    stubUseState()
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    const select = wrapper.find('select')
    await select.setValue('ja')
    expect((select.element as HTMLSelectElement).value).toBe('ja')
  })

  it('shows a login link and no avatar when the user is logged out', () => {
    stubUseState(null)
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    expect(wrapper.text()).toContain('Log in')
    expect(wrapper.find('.user-avatar-stub').exists()).toBe(false)
  })

  it('shows the user avatar in a dropdown with profile and logout options when logged in', () => {
    stubUseState({ avatar_seed: 'seed-1', user_name: 'tester' })
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    expect(wrapper.find('.user-avatar-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('Profile')
    expect(wrapper.text()).toContain('Log out')
  })

  it('shows a favorites link in the dropdown when logged in', () => {
    stubUseState({ avatar_seed: 'seed-1', user_name: 'tester' })
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    expect(wrapper.text()).toContain('Favorites')
  })

  it('logs out and redirects to /login when the logout item is selected', async () => {
    const { fetchMock, navigateMock } = stubUseState({ avatar_seed: 'seed-1', user_name: 'tester' })
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    const logoutItem = wrapper.findAll('li').find((li) => li.text() === 'Log out')
    await logoutItem?.trigger('click')
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    expect(navigateMock).toHaveBeenCalledWith('/login')
  })
})
