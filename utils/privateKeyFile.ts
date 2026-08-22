export const PRIVATE_KEY_FILE_NAME = 'asakusatoday-private-key.txt'

export function formatLocalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

export function buildPrivateKeyFileContent(privateKey: string, createdAt: Date): string {
  return `ASAKUSA TODAY - 秘密鍵

この秘密鍵はあなたのアカウントへの唯一のログイン手段です。
再発行・復元はできません。安全な場所に保管し、誰にも教えないでください。

作成日時: ${formatLocalDateTime(createdAt)}
秘密鍵: ${privateKey}
`
}
