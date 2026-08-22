<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useGeolocation } from '../composables/useGeolocation'

const { t } = useUiText()

const ASAKUSA_CENTER: [number, number] = [35.7148, 139.7967]
const DEFAULT_ZOOM = 16

const mapContainer = ref<HTMLElement | null>(null)
const { state: geo, start: startGeolocation, stop: stopGeolocation } = useGeolocation()

let map: import('leaflet').Map | null = null
let userMarker: import('leaflet').CircleMarker | null = null
let accuracyCircle: import('leaflet').Circle | null = null

onMounted(async () => {
  const L = await import('leaflet')
  if (!mapContainer.value) return
  map = L.map(mapContainer.value).setView(ASAKUSA_CENTER, DEFAULT_ZOOM)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map)

  startGeolocation()
})

onUnmounted(() => {
  stopGeolocation()
  map?.remove()
  map = null
})

watch(
  () => [geo.value.lat, geo.value.lng, geo.value.accuracy] as const,
  async ([lat, lng, accuracy]) => {
    if (lat === null || lng === null || !map) return
    const L = await import('leaflet')
    if (!userMarker) {
      userMarker = L.circleMarker([lat, lng], {
        radius: 8,
        color: '#287c7b',
        fillColor: '#287c7b',
        fillOpacity: 1
      }).addTo(map)
      accuracyCircle = L.circle([lat, lng], {
        radius: accuracy ?? 0,
        color: '#287c7b',
        fillOpacity: 0.15
      }).addTo(map)
    } else {
      userMarker.setLatLng([lat, lng])
      accuracyCircle?.setLatLng([lat, lng]).setRadius(accuracy ?? 0)
    }
  }
)

function recenter(): void {
  if (!map) return
  if (geo.value.lat !== null && geo.value.lng !== null) {
    map.setView([geo.value.lat, geo.value.lng], map.getZoom())
  } else {
    map.setView(ASAKUSA_CENTER, DEFAULT_ZOOM)
  }
}
</script>

<template>
  <div class="relative flex-1 min-h-0 w-full">
    <div ref="mapContainer" class="absolute inset-0" />
    <button
      type="button"
      class="absolute bottom-6 right-4 z-[1000] flex h-11 w-11 items-center justify-center rounded-full bg-default shadow ring ring-default"
      :aria-label="t('map.recenterAria')"
      @click="recenter"
    >
      <span class="text-xl" aria-hidden="true">📍</span>
    </button>
    <p
      v-if="geo.status === 'denied' || geo.status === 'unsupported' || geo.status === 'error'"
      class="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] rounded bg-default px-3 py-2 text-xs shadow ring ring-default"
    >
      {{ t('map.enableLocation') }}
    </p>
  </div>
</template>
