import { useDb } from '../server/utils/db'
import { collectAllSources } from '../server/utils/collector'
import { SOURCE_SITES } from '../server/config/sources'

async function main() {
  const db = useDb()
  const result = await collectAllSources(db, SOURCE_SITES)
  console.log(`収集完了: 新規${result.inserted}件, スキップ${result.skipped}件, エラー${result.error}件`)
}

main()
