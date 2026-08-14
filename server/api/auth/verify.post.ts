import { z } from 'zod'
import { useDb } from '../../utils/db'
import { consumeNonce } from '../../utils/nonce'
import { verifySignature } from '../../../utils/symbolCrypto'
import { generateUniqueUserName } from '../../utils/username'
import { generateAvatarSeed } from '../../utils/avatarSeed'
import { createSession, attachSessionCookie, type UserRow } from '../../utils/session'

const bodySchema = z.object({
  address: z.string().min(1),
  publicKey: z.string().min(1),
  signature: z.string().min(1),
  nonce: z.string().min(1)
})

export default defineEventHandler(async (event) => {
  const { address, publicKey, signature, nonce } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  if (!consumeNonce(db, address, nonce)) {
    throw createError({ statusCode: 401, message: 'nonceが無効です' })
  }

  if (!verifySignature(publicKey, nonce, signature)) {
    throw createError({ statusCode: 401, message: '署名が無効です' })
  }

  let user = db.prepare('SELECT * FROM users WHERE address = ?').get(address) as UserRow | undefined
  if (!user) {
    const userName = generateUniqueUserName(db)
    const avatarSeed = generateAvatarSeed()
    db.prepare(
      `INSERT INTO users (address, public_key, user_name, avatar_seed, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(address, publicKey, userName, avatarSeed)
    user = db.prepare('SELECT * FROM users WHERE address = ?').get(address) as UserRow
  }

  const session = createSession(db, user.id)
  attachSessionCookie(event, session.id, session.expiresAt)

  return { userName: user.user_name }
})
