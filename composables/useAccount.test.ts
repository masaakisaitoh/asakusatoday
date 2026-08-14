import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAccount', () => {
  it('creates a new account with a 64-char hex private key', async () => {
    const { useAccount } = await import('./useAccount')
    const { createNewAccount } = useAccount()
    const account = await createNewAccount()
    expect(account.privateKey).toMatch(/^[0-9A-Fa-f]{64}$/)
    expect(account.address.length).toBeGreaterThan(0)
  })

  it('logs in by requesting a nonce, signing it, and posting verify', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ nonce: 'abc123' })
      .mockResolvedValueOnce({ userName: 'FRESHUSER0000001' })
    vi.stubGlobal('$fetch', fetchMock)

    const { useAccount } = await import('./useAccount')
    const { createNewAccount, loginWithAccount } = useAccount()
    const account = await createNewAccount()
    const result = await loginWithAccount(account)

    expect(result.userName).toBe('FRESHUSER0000001')
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/auth/nonce', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/verify', expect.objectContaining({ method: 'POST' }))
  })
})
