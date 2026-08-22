import { describe, it, expect, vi } from 'vitest'
import { defineComponent, ref, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useSwipe, type SwipeOptions } from './useSwipe'

function mountSwipeTarget(options: SwipeOptions) {
  const TestComponent = defineComponent({
    setup() {
      const el = ref<HTMLElement | null>(null)
      useSwipe(el, options)
      return () => h('div', { ref: el })
    }
  })
  return mount(TestComponent)
}

function touch(clientX: number, clientY: number, target: Element): Touch {
  return new Touch({ identifier: 1, target, clientX, clientY })
}

describe('useSwipe', () => {
  it('calls onSwipeLeft when swiping left past the threshold', () => {
    const onSwipeLeft = vi.fn()
    const wrapper = mountSwipeTarget({ onSwipeLeft })
    const el = wrapper.element

    el.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(200, 100, el)] }))
    el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(100, 100, el)] }))

    expect(onSwipeLeft).toHaveBeenCalledOnce()
  })

  it('calls onSwipeRight when swiping right past the threshold', () => {
    const onSwipeRight = vi.fn()
    const wrapper = mountSwipeTarget({ onSwipeRight })
    const el = wrapper.element

    el.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(100, 100, el)] }))
    el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(200, 100, el)] }))

    expect(onSwipeRight).toHaveBeenCalledOnce()
  })

  it('does not call either callback when the swipe is below the threshold', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    const wrapper = mountSwipeTarget({ onSwipeLeft, onSwipeRight })
    const el = wrapper.element

    el.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(100, 100, el)] }))
    el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(130, 100, el)] }))

    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('does not call either callback when the vertical movement dominates', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    const wrapper = mountSwipeTarget({ onSwipeLeft, onSwipeRight })
    const el = wrapper.element

    el.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(100, 100, el)] }))
    el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(200, 300, el)] }))

    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('respects a custom threshold', () => {
    const onSwipeLeft = vi.fn()
    const wrapper = mountSwipeTarget({ onSwipeLeft, threshold: 10 })
    const el = wrapper.element

    el.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(100, 100, el)] }))
    el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(85, 100, el)] }))

    expect(onSwipeLeft).toHaveBeenCalledOnce()
  })
})
