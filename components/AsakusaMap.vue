<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useGeolocation } from '../composables/useGeolocation'

const { t } = useUiText()
const { locale } = useArticleLocale()

const ASAKUSA_CENTER: [number, number] = [35.7148, 139.7967]
const DEFAULT_ZOOM = 16
const LOCATION_BLUE = '#4285f4'
const MAP_ATTRIBUTION =
  '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>'

const mapContainer = ref<HTMLElement | null>(null)
const { state: geo, start: startGeolocation, stop: stopGeolocation } = useGeolocation()

let map: import('leaflet').Map | null = null
let userMarker: import('leaflet').CircleMarker | null = null
let accuracyCircle: import('leaflet').Circle | null = null
let pulseMarker: import('leaflet').Marker | null = null
let glLayer: import('leaflet').MaplibreGL | null = null
let glMap: import('maplibre-gl').Map | null = null

function mapLocaleToTileLang(value: string): string {
  switch (value) {
    case 'zh-Hant':
      return 'zh-Hant'
    case 'zh-Hans':
      return 'zh-Hans'
    default:
      return value
  }
}

function styleUrl(): string {
  const config = useRuntimeConfig()
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${config.public.maptilerKey}`
}

function applyMapLanguage(glMap: import('maplibre-gl').Map, lang: string): void {
  const style = glMap.getStyle()
  if (!style?.layers) return
  for (const layer of style.layers) {
    if (layer.type !== 'symbol') continue
    const textField = glMap.getLayoutProperty(layer.id, 'text-field')
    if (textField === undefined) continue
    glMap.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', `name:${lang}`], ['get', 'name']])
  }
}

function pulseIcon(L: typeof import('leaflet')): import('leaflet').DivIcon {
  return L.divIcon({
    className: '',
    html: '<span class="map-user-pulse" aria-hidden="true"></span>',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  })
}

onMounted(async () => {
  const L = await import('leaflet')
  const { maplibreGL } = await import('@maplibre/maplibre-gl-leaflet')
  const { setWorkerUrl } = await import('maplibre-gl')
  const { default: workerUrl } = await import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')
  setWorkerUrl(workerUrl)
  if (!mapContainer.value) return
  map = L.map(mapContainer.value, {
    zoomControl: false,
    maxBounds: [
      [180, -Infinity],
      [-180, Infinity]
    ],
    maxBoundsViscosity: 1,
    minZoom: 1,
    maxZoom: 20
  }).setView(ASAKUSA_CENTER, DEFAULT_ZOOM)
  map.createPane('pulsePane')
  const pulsePane = map.getPane('pulsePane')
  if (pulsePane) {
    pulsePane.style.zIndex = '350'
    pulsePane.style.pointerEvents = 'none'
  }
  L.control.zoom({ position: 'topright' }).addTo(map)
  map.attributionControl.setPrefix(false)
  map.attributionControl.addAttribution(MAP_ATTRIBUTION)

  glLayer = maplibreGL({ style: styleUrl(), attributionControl: false }).addTo(map)
  glMap = glLayer.getMaplibreMap()
  glMap.on('load', () => {
    if (glMap) applyMapLanguage(glMap, mapLocaleToTileLang(locale.value))
  })
  glMap.on('error', (e) => {
    console.error('MapLibre GL map error:', e.error)
  })

  startGeolocation()
})

onUnmounted(() => {
  stopGeolocation()
  map?.remove()
  map = null
})

watch(locale, (newLocale) => {
  if (glMap && glMap.isStyleLoaded()) {
    applyMapLanguage(glMap, mapLocaleToTileLang(newLocale))
  }
})

watch(
  () => [geo.value.lat, geo.value.lng, geo.value.accuracy] as const,
  async ([lat, lng, accuracy]) => {
    if (lat === null || lng === null || !map) return
    const L = await import('leaflet')
    if (!userMarker) {
      pulseMarker = L.marker([lat, lng], {
        icon: pulseIcon(L),
        pane: 'pulsePane',
        interactive: false,
        keyboard: false
      }).addTo(map)
      accuracyCircle = L.circle([lat, lng], {
        radius: accuracy ?? 0,
        color: LOCATION_BLUE,
        weight: 1,
        fillColor: LOCATION_BLUE,
        fillOpacity: 0.15
      }).addTo(map)
      userMarker = L.circleMarker([lat, lng], {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: LOCATION_BLUE,
        fillOpacity: 1
      }).addTo(map)
    } else {
      pulseMarker?.setLatLng([lat, lng])
      accuracyCircle?.setLatLng([lat, lng]).setRadius(accuracy ?? 0)
      userMarker.setLatLng([lat, lng])
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
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="#4285f4"
        stroke-width="2"
        stroke-linecap="round"
      >
        <line x1="12" y1="1" x2="12" y2="4" />
        <line x1="12" y1="20" x2="12" y2="23" />
        <line x1="1" y1="12" x2="4" y2="12" />
        <line x1="20" y1="12" x2="23" y2="12" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2.5" fill="#4285f4" stroke="none" />
      </svg>
    </button>
    <p
      v-if="geo.status === 'denied' || geo.status === 'unsupported' || geo.status === 'error'"
      class="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] rounded bg-default px-3 py-2 text-xs shadow ring ring-default"
    >
      {{ t('map.enableLocation') }}
    </p>
  </div>
</template>

<style>
.map-user-pulse {
  display: block;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(66, 133, 244, 0.55);
  animation: map-user-pulse-out 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes map-user-pulse-out {
  0% {
    transform: scale(0.3);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.6);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .map-user-pulse {
    animation: none;
    opacity: 0.35;
  }
}
</style>
