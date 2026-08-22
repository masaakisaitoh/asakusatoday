import { describe, it, expect } from 'vitest'
import { buildPrivateKeyFileContent, formatLocalDateTime, PRIVATE_KEY_FILE_NAME } from './privateKeyFile'

describe('formatLocalDateTime', () => {
  it('formats a date as YYYY-MM-DD HH:mm:ss with zero-padding', () => {
    const date = new Date(2026, 0, 5, 9, 3, 7)
    expect(formatLocalDateTime(date)).toBe('2026-01-05 09:03:07')
  })
})

describe('buildPrivateKeyFileContent', () => {
  it('includes the private key and formatted creation timestamp', () => {
    const date = new Date(2026, 7, 16, 14, 32, 10)
    const privateKey = 'ABCDEF0123456789'.repeat(4)
    const content = buildPrivateKeyFileContent(privateKey, date)
    expect(content).toContain('作成日時: 2026-08-16 14:32:10')
    expect(content).toContain(`秘密鍵: ${privateKey}`)
  })

  it('includes the required warning text', () => {
    const content = buildPrivateKeyFileContent('abc123', new Date())
    expect(content).toContain('再発行・復元はできません')
    expect(content).toContain('誰にも教えないでください')
  })
})

describe('PRIVATE_KEY_FILE_NAME', () => {
  it('is the fixed filename for the downloaded key file', () => {
    expect(PRIVATE_KEY_FILE_NAME).toBe('asakusatoday-private-key.txt')
  })
})
