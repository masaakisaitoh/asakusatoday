import { describe, it, expect } from 'vitest'

describe('symbolCrypto', () => {
  it('verifies a signature produced by the matching private key', async () => {
    const { generateAccount, signMessage, verifySignature } = await import('./symbolCrypto')
    const account = generateAccount()
    const signature = signMessage(account.privateKey, 'hello-nonce')
    expect(verifySignature(account.publicKey, 'hello-nonce', signature)).toBe(true)
  })

  it('rejects a signature for a tampered message', async () => {
    const { generateAccount, signMessage, verifySignature } = await import('./symbolCrypto')
    const account = generateAccount()
    const signature = signMessage(account.privateKey, 'hello-nonce')
    expect(verifySignature(account.publicKey, 'tampered', signature)).toBe(false)
  })

  it('derives the same address exposed by generateAccount', async () => {
    const { generateAccount, deriveAddress } = await import('./symbolCrypto')
    const account = generateAccount()
    expect(deriveAddress(account.publicKey)).toBe(account.address)
  })

  it('imports the same account from its private key', async () => {
    const { generateAccount, importAccount } = await import('./symbolCrypto')
    const original = generateAccount()
    const imported = importAccount(original.privateKey)
    expect(imported.address).toBe(original.address)
    expect(imported.publicKey).toBe(original.publicKey)
  })
})
