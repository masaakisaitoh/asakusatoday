export function truncateForDescription(body: string, maxLen = 155): string {
  const normalized = body.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLen) return normalized
  const cut = normalized.slice(0, maxLen)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLen)}…`
}

export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function toIso8601(sqliteDatetime: string | null): string | undefined {
  if (!sqliteDatetime) return undefined
  return `${sqliteDatetime.replace(' ', 'T')}Z`
}
