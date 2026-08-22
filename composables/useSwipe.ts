import { onMounted, onUnmounted, type Ref } from 'vue'

export interface SwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
}

export function useSwipe(target: Ref<HTMLElement | null>, options: SwipeOptions): void {
  const threshold = options.threshold ?? 60
  let startX = 0
  let startY = 0

  function onTouchStart(event: TouchEvent): void {
    const touch = event.touches[0]
    startX = touch.clientX
    startY = touch.clientY
  }

  function onTouchEnd(event: TouchEvent): void {
    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - startX
    const deltaY = touch.clientY - startY
    if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY)) return
    if (deltaX < 0) {
      options.onSwipeLeft?.()
    } else {
      options.onSwipeRight?.()
    }
  }

  onMounted(() => {
    target.value?.addEventListener('touchstart', onTouchStart)
    target.value?.addEventListener('touchend', onTouchEnd)
  })

  onUnmounted(() => {
    target.value?.removeEventListener('touchstart', onTouchStart)
    target.value?.removeEventListener('touchend', onTouchEnd)
  })
}
