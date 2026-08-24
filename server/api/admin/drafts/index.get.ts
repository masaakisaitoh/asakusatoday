import { useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/admin'
import { listDraftArticles, parsePage } from '../../../utils/articles'

export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const query = getQuery(event)
  const page = parsePage(query.page)
  return listDraftArticles(db, page, 'ja')
})
