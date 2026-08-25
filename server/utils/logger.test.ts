import { describe, it, expect, vi, afterEach } from 'vitest'
import { installTimestampedLogging } from './logger'

describe('installTimestampedLogging', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('prefixes console.log output with a JST timestamp', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    installTimestampedLogging()
    console.log('収集完了')
    expect(log).toHaveBeenCalledWith('[2026-01-01T09:00:00.000+09:00]', '収集完了')
  })

  it('prefixes console.error output with a JST timestamp', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    installTimestampedLogging()
    console.error('収集エラー')
    expect(error).toHaveBeenCalledWith('[2026-01-01T09:00:00.000+09:00]', '収集エラー')
  })

  it('rolls over to the next JST day when UTC time is on the previous day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T15:30:45.123Z'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    installTimestampedLogging()
    console.log('収集完了')
    expect(log).toHaveBeenCalledWith('[2026-01-02T00:30:45.123+09:00]', '収集完了')
  })
})
