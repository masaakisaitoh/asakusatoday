import { randomBytes } from 'node:crypto'

export function generateAvatarSeed(): string {
  return randomBytes(12).toString('hex')
}
