import { describe, it, expect } from 'vitest'

describe('generateAvatarSeed', () => {
  it('returns a 24-character hex string', async () => {
    const { generateAvatarSeed } = await import('./avatarSeed')
    expect(generateAvatarSeed()).toMatch(/^[0-9a-f]{24}$/)
  })

  it('returns a different value on each call', async () => {
    const { generateAvatarSeed } = await import('./avatarSeed')
    expect(generateAvatarSeed()).not.toBe(generateAvatarSeed())
  })
})
