import { useDb } from '../../../utils/db'
import { requireSessionUser } from '../../../utils/session'
import { generateAvatarSeed } from '../../../utils/avatarSeed'

export default defineEventHandler((event) => {
  const db = useDb()
  const user = requireSessionUser(db, event)
  const avatarSeed = generateAvatarSeed()
  db.prepare('UPDATE users SET avatar_seed = ? WHERE id = ?').run(avatarSeed, user.id)
  return { avatarSeed }
})
