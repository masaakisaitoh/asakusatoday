import { ref, type Ref } from 'vue'

export interface GeolocationState {
  lat: number | null
  lng: number | null
  accuracy: number | null
  status: 'idle' | 'watching' | 'denied' | 'unsupported' | 'error'
}

export function useGeolocation(): {
  state: Ref<GeolocationState>
  start: () => void
  stop: () => void
} {
  const state = ref<GeolocationState>({ lat: null, lng: null, accuracy: null, status: 'idle' })
  let watchId: number | null = null

  function start(): void {
    if (!navigator.geolocation) {
      state.value = { ...state.value, status: 'unsupported' }
      return
    }
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        state.value = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          status: 'watching'
        }
      },
      (error) => {
        state.value = { ...state.value, status: error.code === error.PERMISSION_DENIED ? 'denied' : 'error' }
      },
      { enableHighAccuracy: true }
    )
  }

  function stop(): void {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
  }

  return { state, start, stop }
}
