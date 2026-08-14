// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch as rawFetch } from '@nuxt/test-utils/e2e'
import { generateAccount, signMessage } from '../../utils/symbolCrypto'

async function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return rawFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
}

describe('auth API', async () => {
  await setup({ server: true, env: { DATABASE_PATH: ':memory:' } })

  it('logs in a new account via nonce + signature and sets a session cookie', async () => {
    const account = generateAccount()

    const { nonce } = await $fetch('/api/auth/nonce', {
      method: 'POST',
      body: { address: account.address }
    })

    const signature = signMessage(account.privateKey, nonce)

    const response = await postJson('/api/auth/verify', {
      address: account.address,
      publicKey: account.publicKey,
      signature,
      nonce
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toMatch(/session_id=/)
  })

  it('rejects verify when the signature does not match the nonce', async () => {
    const account = generateAccount()
    const { nonce } = await $fetch('/api/auth/nonce', {
      method: 'POST',
      body: { address: account.address }
    })
    const badSignature = signMessage(account.privateKey, 'different-message')

    await expect(
      $fetch('/api/auth/verify', {
        method: 'POST',
        body: { address: account.address, publicKey: account.publicKey, signature: badSignature, nonce }
      })
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('logs out and clears the session cookie', async () => {
    const account = generateAccount()
    const { nonce } = await $fetch('/api/auth/nonce', {
      method: 'POST',
      body: { address: account.address }
    })
    const signature = signMessage(account.privateKey, nonce)
    const verifyResponse = await postJson('/api/auth/verify', {
      address: account.address,
      publicKey: account.publicKey,
      signature,
      nonce
    })
    const cookie = (verifyResponse.headers.get('set-cookie') ?? '').split(';')[0]

    const logoutResponse = await postJson('/api/auth/logout', {}, { cookie })
    expect(logoutResponse.status).toBe(200)
  })
})
