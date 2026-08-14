// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { setup, createPage } from '@nuxt/test-utils/e2e'

describe('account flow', async () => {
  await setup({ server: true, env: { DATABASE_PATH: ':memory:' } })

  it('creates an account, views the profile, regenerates the avatar, and logs out', async () => {
    const page = await createPage('/account/create')
    await page.click('text=アカウントを新規作成')

    const privateKey = await page.locator('code').innerText()
    expect(privateKey).toMatch(/^[0-9A-Fa-f]{64}$/)

    await page.check('input[type=checkbox]')
    await page.click('text=続ける')
    await page.waitForURL(/\/profile/)
    await page.waitForSelector('svg')

    expect(await page.locator('svg').isVisible()).toBe(true)
    const before = await page.locator('svg').innerHTML()
    await page.click('text=作り直す')
    await expect.poll(() => page.locator('svg').innerHTML()).not.toBe(before)

    await page.click('text=ログアウト')
    await page.waitForURL(/\/login/)

    await page.close()
  }, 30000)
})
