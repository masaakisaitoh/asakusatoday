import { useDb } from '../../utils/db'
import { requireSessionUser } from '../../utils/session'

export default defineEventHandler((event) => {
  const db = useDb()
  return requireSessionUser(db, event)
})
