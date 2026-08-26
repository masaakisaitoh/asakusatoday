<script setup lang="ts">
import { ref } from 'vue'
import { useSwipe } from '../composables/useSwipe'
import type { MapPin } from '../utils/mapPins'

const config = useRuntimeConfig()
useSeoMeta({
  title: 'Asakusa Map',
  description: 'Interactive map of Asakusa spots featured on ASAKUSA TODAY.',
  ogUrl: `${config.public.siteUrl}/map`
})

const { data: pins } = await useFetch<MapPin[]>('/api/map-pins')

const pageRoot = ref<HTMLElement | null>(null)
const transitionDirection = useState<'forward' | 'back'>('swipeTransitionDirection', () => 'forward')

useSwipe(pageRoot, {
  onSwipeRight: () => {
    transitionDirection.value = 'back'
    navigateTo('/')
  }
})
</script>

<template>
  <div ref="pageRoot" data-swipe-target class="flex-1 min-h-0 flex flex-col">
    <ClientOnly>
      <AsakusaMap :pins="pins ?? []" />
    </ClientOnly>
  </div>
</template>
