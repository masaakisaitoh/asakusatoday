import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UserAvatar from './UserAvatar.vue'

describe('UserAvatar', () => {
  it('renders an svg element', () => {
    const wrapper = mount(UserAvatar, { props: { seed: 'seed-one' } })
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('renders different markup for different seeds', () => {
    const a = mount(UserAvatar, { props: { seed: 'seed-one' } }).html()
    const b = mount(UserAvatar, { props: { seed: 'seed-two' } }).html()
    expect(a).not.toBe(b)
  })
})
