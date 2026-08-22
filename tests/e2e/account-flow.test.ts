// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { setup, createPage } from '@nuxt/test-utils/e2e'

async function createAndLoginAccount(page: Awaited<ReturnType<typeof createPage>>): Promise<void> {
  await page.check('input[type=checkbox]')
  await page.click('text=Create account')
  await page.check('input[type=checkbox]')
  await page.click('text=Continue')
  await page.waitForURL(/\/profile/)
}

describe('account flow', async () => {
  await setup({ server: true, env: { DATABASE_PATH: ':memory:' } })

  it('creates an account, views the profile, regenerates the avatar, and logs out', async () => {
    const page = await createPage('/account/create')
    await page.check('input[type=checkbox]')
    await page.click('text=Create account')

    const privateKey = await page.locator('code').innerText()
    expect(privateKey).toMatch(/^[0-9A-Fa-f]{64}$/)

    await page.check('input[type=checkbox]')
    await page.click('text=Continue')
    await page.waitForURL(/\/profile/)
    await page.waitForSelector('main svg')

    expect(await page.locator('main svg').isVisible()).toBe(true)
    expect(await page.locator('text=Not set').count()).toBe(3)
    expect(await page.locator('dd.font-mono').isVisible()).toBe(true)

    const before = await page.locator('main svg').innerHTML()
    await page.click('text=Regenerate avatar')
    await expect.poll(() => page.locator('main svg').innerHTML()).not.toBe(before)

    await page.click('text=Log out')
    await page.waitForURL(/\/login/)

    await page.close()
  }, 30000)

  it('updates the header avatar immediately after login and after regenerating, without a page reload', async () => {
    const page = await createPage('/account/create')
    await createAndLoginAccount(page)

    await page.waitForSelector('[aria-label="User menu"] svg', { timeout: 10000 })
    const headerBefore = await page.locator('[aria-label="User menu"] svg').innerHTML()
    const profileBefore = await page.locator('main svg').first().innerHTML()
    expect(headerBefore).toBe(profileBefore)

    await page.click('text=Regenerate avatar')
    await expect.poll(() => page.locator('main svg').first().innerHTML()).not.toBe(profileBefore)

    const headerAfter = await page.locator('[aria-label="User menu"] svg').innerHTML()
    const profileAfter = await page.locator('main svg').first().innerHTML()
    expect(headerAfter).toBe(profileAfter)

    await page.close()
  }, 30000)

  it('shows the header avatar when logged in and logs out via the header dropdown menu', async () => {
    const page = await createPage('/account/create')
    await createAndLoginAccount(page)

    await page.goto(new URL('/', page.url()).toString())
    await page.waitForSelector('[aria-label="User menu"]')
    expect(await page.locator('a:has-text("Log in")').count()).toBe(0)

    await page.click('[aria-label="User menu"]')
    await page.click('text=Log out')
    await page.waitForURL(/\/login/)

    await page.close()
  }, 30000)

  it('edits the profile and saves the changes', async () => {
    const page = await createPage('/account/create')
    await createAndLoginAccount(page)

    await page.click('text=Edit profile')
    await page.fill('input[name=userName]', 'UpdatedName0001')
    await page.click('text=Save')

    await page.waitForSelector('text=UpdatedName0001')
    expect(await page.locator('text=Edit profile').isVisible()).toBe(true)

    await page.close()
  }, 30000)

  it('discards changes when Cancel is clicked', async () => {
    const page = await createPage('/account/create')
    await createAndLoginAccount(page)

    const originalName = await page.locator('dd').first().innerText()

    await page.click('text=Edit profile')
    await page.fill('input[name=userName]', 'ShouldNotSaveXX')
    await page.click('text=Cancel')

    expect(await page.locator(`text=${originalName}`).isVisible()).toBe(true)
    expect(await page.locator('text=ShouldNotSaveXX').count()).toBe(0)

    await page.close()
  }, 30000)

  it('shows an error when the username is already taken', async () => {
    const pageA = await createPage('/account/create')
    await createAndLoginAccount(pageA)
    const takenName = await pageA.locator('dd').first().innerText()

    const pageB = await createPage('/account/create')
    await createAndLoginAccount(pageB)

    await pageB.click('text=Edit profile')
    await pageB.fill('input[name=userName]', takenName)
    await pageB.click('text=Save')

    await pageB.waitForSelector('text=This username is already taken.')

    await pageA.close()
    await pageB.close()
  }, 30000)

  it('defaults to Light theme and previews Dark immediately when selected', async () => {
    const page = await createPage('/account/create')
    await createAndLoginAccount(page)
    await page.waitForSelector('main svg')

    expect(await page.locator('text=Light').first().isVisible()).toBe(true)

    await page.click('text=Edit profile')
    await page.getByLabel('Theme').click()
    await page.getByRole('option', { name: 'Dark' }).click()

    await expect.poll(async () => (await page.locator('html').getAttribute('class')) ?? '').toContain('dark')

    await page.close()
  }, 30000)

  it('persists the selected theme after saving and reloading', async () => {
    const page = await createPage('/account/create')
    await createAndLoginAccount(page)

    await page.click('text=Edit profile')
    await page.getByLabel('Theme').click()
    await page.getByRole('option', { name: 'Dark' }).click()
    await page.click('text=Save')

    await page.reload()
    await page.waitForSelector('text=Dark')
    await expect.poll(async () => (await page.locator('html').getAttribute('class')) ?? '').toContain('dark')

    await page.close()
  }, 30000)
})
