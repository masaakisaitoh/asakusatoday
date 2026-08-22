import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WeatherCard from './WeatherCard.vue'

const stubs = {
  UCard: { template: '<div><slot /></div>' }
}

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
