function formatJstTimestamp(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  const y = jst.getUTCFullYear()
  const mo = pad(jst.getUTCMonth() + 1)
  const d = pad(jst.getUTCDate())
  const h = pad(jst.getUTCHours())
  const mi = pad(jst.getUTCMinutes())
  const s = pad(jst.getUTCSeconds())
  const ms = pad(jst.getUTCMilliseconds(), 3)
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}+09:00`
}

export function installTimestampedLogging(): void {
  const originalLog = console.log.bind(console)
  const originalError = console.error.bind(console)
  console.log = (...args: unknown[]) => originalLog(`[${formatJstTimestamp(new Date())}]`, ...args)
  console.error = (...args: unknown[]) => originalError(`[${formatJstTimestamp(new Date())}]`, ...args)
}
