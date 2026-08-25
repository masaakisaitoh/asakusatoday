import { useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/admin'
import { parsePage } from '../../../utils/articles'
import { listSources } from '../../../utils/sources'

export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const query = getQuery(event)
  const page = parsePage(query.page)
  return listSources(db, page)
})
