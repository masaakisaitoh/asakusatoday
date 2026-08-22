// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { setup, createPage } from '@nuxt/test-utils/e2e'

describe('map page', async () => {
  await setup({ server: true, env: { DATABASE_PATH: ':memory:' } })

  it('is accessible without logging in and renders the Leaflet map', async () => {
    const page = await createPage('/map')
    await page.waitForSelector('.leaflet-container')
    expect(await page.locator('.leaflet-container').isVisible()).toBe(true)

    await page.close()
  }, 60000)

  it('shows the current-location dot when geolocation permission is granted', async () => {
    const page = await createPage('/map', {
      permissions: ['geolocation'],
      geolocation: { latitude: 35.7148, longitude: 139.7967, accuracy: 10 }
    })
    await page.waitForSelector('.leaflet-container')
    await page.waitForSelector('path.leaflet-interactive')

    expect(await page.locator('path.leaflet-interactive').count()).toBeGreaterThan(0)

    await page.close()
  }, 60000)

  it('shows the fallback message when geolocation permission is denied', async () => {
    const page = await createPage('/map', { permissions: [] })
    await page.waitForSelector('.leaflet-container')

    await page.waitForSelector('text=Enable location access to see your position on the map.')

    await page.close()
  }, 60000)

  it('navigates to /map when swiping left on the home page', async () => {
    const page = await createPage('/', { hasTouch: true })
    await page.waitForSelector('[data-swipe-target]')

    await page.evaluate(() => {
      const el = document.querySelector('[data-swipe-target]')
      if (!el) throw new Error('swipe target not found')
      const makeTouch = (x: number, y: number) =>
        new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [makeTouch(300, 200)] }))
      el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [makeTouch(50, 200)] }))
    })

    await page.waitForURL(/\/map/)

    await page.close()
  }, 60000)

  it('navigates back to / when swiping right on the map page', async () => {
    const page = await createPage('/map', { hasTouch: true })
    await page.waitForSelector('[data-swipe-target]')

    await page.evaluate(() => {
      const el = document.querySelector('[data-swipe-target]')
      if (!el) throw new Error('swipe target not found')
      const makeTouch = (x: number, y: number) =>
        new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [makeTouch(50, 200)] }))
      el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [makeTouch(300, 200)] }))
    })

    await page.waitForURL((url) => url.pathname === '/')

    await page.close()
  }, 60000)
})
