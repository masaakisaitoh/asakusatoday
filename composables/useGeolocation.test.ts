import { describe, it, expect, afterEach } from 'vitest'
import { useGeolocation } from './useGeolocation'

afterEach(() => {
  Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
})

describe('useGeolocation', () => {
  it('updates state and sets status to watching on a successful position', () => {
    let successCallback: PositionCallback = () => {}
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (success: PositionCallback) => {
          successCallback = success
          return 1
        },
        clearWatch: () => {}
      }
    })

    const { state, start } = useGeolocation()
    start()
    successCallback({
      coords: { latitude: 35.71, longitude: 139.79, accuracy: 12 }
    } as GeolocationPosition)

    expect(state.value).toEqual({ lat: 35.71, lng: 139.79, accuracy: 12, status: 'watching' })
  })

  it('sets status to denied when the error code is PERMISSION_DENIED', () => {
    let errorCallback: PositionErrorCallback = () => {}
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
          errorCallback = error
          return 1
        },
        clearWatch: () => {}
      }
    })

    const { state, start } = useGeolocation()
    start()
    errorCallback({
      code: 1,
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
      message: 'denied'
    } as GeolocationPositionError)

    expect(state.value.status).toBe('denied')
  })

  it('sets status to error for non-permission errors', () => {
    let errorCallback: PositionErrorCallback = () => {}
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
          errorCallback = error
          return 1
        },
        clearWatch: () => {}
      }
    })

    const { state, start } = useGeolocation()
    start()
    errorCallback({
      code: 2,
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
      message: 'unavailable'
    } as GeolocationPositionError)

    expect(state.value.status).toBe('error')
  })

  it('sets status to unsupported when navigator.geolocation is unavailable', () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })

    const { state, start } = useGeolocation()
    start()

    expect(state.value.status).toBe('unsupported')
  })

  it('calls clearWatch with the watch id on stop', () => {
    let clearedId: number | null = null
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: () => 42,
        clearWatch: (id: number) => {
          clearedId = id
        }
      }
    })

    const { start, stop } = useGeolocation()
    start()
    stop()

    expect(clearedId).toBe(42)
  })
})
