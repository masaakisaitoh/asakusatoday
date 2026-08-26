import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AdminNav from './AdminNav.vue'

const stubs = {
  NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' }
}

describe('AdminNav', () => {
  it('renders links to all four admin pages', () => {
    const wrapper = mount(AdminNav, { global: { stubs } })
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(hrefs).toEqual(['/admin/drafts', '/admin/articles', '/admin/sources', '/admin/map-pins'])
  })

  it('renders the expected labels', () => {
    const wrapper = mount(AdminNav, { global: { stubs } })
    expect(wrapper.text()).toContain('Drafts')
    expect(wrapper.text()).toContain('Articles')
    expect(wrapper.text()).toContain('Sources')
    expect(wrapper.text()).toContain('Map Pins')
  })
})
