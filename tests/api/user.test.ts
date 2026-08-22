// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch as rawFetch } from '@nuxt/test-utils/e2e'
import { generateAccount, signMessage } from '../../utils/symbolCrypto'

async function loginAndGetCookie(): Promise<string> {
  const account = generateAccount()
  const { nonce } = await $fetch('/api/auth/nonce', { method: 'POST', body: { address: account.address } })
  const signature = signMessage(account.privateKey, nonce)
  const response = await rawFetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: account.address, publicKey: account.publicKey, signature, nonce })
  })
  return (response.headers.get('set-cookie') ?? '').split(';')[0]
}

describe('user API', async () => {
  await setup({ server: true, env: { DATABASE_PATH: ':memory:' } })

  it('rejects requests without a session', async () => {
    await expect($fetch('/api/user/me')).rejects.toMatchObject({ statusCode: 401 })
  })

  it('returns the logged-in user via /api/user/me', async () => {
    const cookie = await loginAndGetCookie()
    const me = await $fetch('/api/user/me', { headers: { cookie } })
    expect(me.user_name).toMatch(/^[A-Za-z0-9]{16}$/)
  })

  it('updates user_name and rejects a duplicate value', async () => {
    const cookieA = await loginAndGetCookie()
    const cookieB = await loginAndGetCookie()

    await $fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { cookie: cookieA },
      body: { userName: 'TakenName0000001' }
    })

    await expect(
      $fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { cookie: cookieB },
        body: { userName: 'TakenName0000001' }
      })
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('regenerates the avatar seed on each call', async () => {
    const cookie = await loginAndGetCookie()
    const first = await $fetch('/api/user/avatar/regenerate', { method: 'POST', headers: { cookie } })
    const second = await $fetch('/api/user/avatar/regenerate', { method: 'POST', headers: { cookie } })
    expect(first.avatarSeed).not.toBe(second.avatarSeed)
  })

  it('updates theme and returns it via /api/user/me', async () => {
    const cookie = await loginAndGetCookie()
    const updated = await $fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { cookie },
      body: { theme: 'dark' }
    })
    expect(updated.theme).toBe('dark')

    const me = await $fetch('/api/user/me', { headers: { cookie } })
    expect(me.theme).toBe('dark')
  })

  it('rejects an invalid theme value', async () => {
    const cookie = await loginAndGetCookie()
    await expect(
      $fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { cookie },
        body: { theme: 'blue' }
      })
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
