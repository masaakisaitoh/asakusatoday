import { describe, it, expect, vi, afterEach } from 'vitest'
import { installTimestampedLogging } from './logger'

describe('installTimestampedLogging', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prefixes console.log output with an ISO timestamp', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    installTimestampedLogging()
    console.log('収集完了')
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]$/), '収集完了')
  })

  it('prefixes console.error output with an ISO timestamp', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    installTimestampedLogging()
    console.error('収集エラー')
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]$/), '収集エラー')
  })
})
