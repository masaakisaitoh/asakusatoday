import { useDb } from '../../utils/db'
import { destroySession } from '../../utils/session'

export default defineEventHandler((event) => {
  const db = useDb()
  destroySession(db, event)
  return { ok: true }
})
