export function installTimestampedLogging(): void {
  const originalLog = console.log.bind(console)
  const originalError = console.error.bind(console)
  console.log = (...args: unknown[]) => originalLog(`[${new Date().toISOString()}]`, ...args)
  console.error = (...args: unknown[]) => originalError(`[${new Date().toISOString()}]`, ...args)
}
