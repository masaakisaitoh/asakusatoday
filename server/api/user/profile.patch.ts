import { z } from 'zod'
import { useDb } from '../../utils/db'
import { requireSessionUser } from '../../utils/session'

const bodySchema = z.object({
  userName: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/).optional(),
  gender: z.enum(['male', 'female', 'other', 'unspecified']).nullable().optional(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
  nationality: z.string().length(2).nullable().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional()
})

export default defineEventHandler(async (event) => {
  const db = useDb()
  const user = requireSessionUser(db, event)
  const body = await readValidatedBody(event, bodySchema.parse)

  if (body.userName && body.userName !== user.user_name) {
    const taken = db.prepare('SELECT 1 FROM users WHERE user_name = ? AND id != ?').get(body.userName, user.id)
    if (taken) {
      throw createError({ statusCode: 409, message: 'そのユーザー名は既に使われています' })
    }
  }

  db.prepare(
    `UPDATE users SET
       user_name = ?,
       gender = ?,
       birth_year = ?,
       nationality = ?,
       theme = ?
     WHERE id = ?`
  ).run(
    body.userName ?? user.user_name,
    body.gender === undefined ? user.gender : body.gender,
    body.birthYear === undefined ? user.birth_year : body.birthYear,
    body.nationality === undefined ? user.nationality : body.nationality,
    body.theme === undefined ? user.theme : body.theme,
    user.id
  )

  return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
})
