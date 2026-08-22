import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

let db: Database.Database | null = null

function dbPath(): string {
  return process.env.DATABASE_PATH || './data/app.sqlite3'
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  address TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  user_name TEXT UNIQUE NOT NULL,
  gender TEXT,
  birth_year INTEGER,
  nationality TEXT,
  avatar_seed TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  theme TEXT NOT NULL DEFAULT 'light',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  url TEXT UNIQUE NOT NULL,
  site_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  raw_text TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  category TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS article_translations (
  article_id INTEGER NOT NULL REFERENCES articles(id),
  locale TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (article_id, locale)
);

CREATE TABLE IF NOT EXISTS article_sources (
  article_id INTEGER NOT NULL REFERENCES articles(id),
  source_id INTEGER NOT NULL REFERENCES sources(id),
  PRIMARY KEY (article_id, source_id)
);
`

function migrate(database: Database.Database): void {
  const userColumns = database.prepare('PRAGMA table_info(users)').all() as { name: string }[]
  if (!userColumns.some((c) => c.name === 'is_admin')) {
    database.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0')
  }
  if (!userColumns.some((c) => c.name === 'theme')) {
    database.exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'light'")
  }
  const sourceColumns = database.prepare('PRAGMA table_info(sources)').all() as { name: string }[]
  if (!sourceColumns.some((c) => c.name === 'category')) {
    database.exec("ALTER TABLE sources ADD COLUMN category TEXT NOT NULL DEFAULT ''")
  }
  const articleColumns = database.prepare('PRAGMA table_info(articles)').all() as { name: string }[]
  if (articleColumns.some((c) => c.name === 'title')) {
    database.exec(`
      INSERT INTO article_translations (article_id, locale, title, body)
      SELECT id, 'ja', title, body FROM articles
    `)
    database.exec('ALTER TABLE articles DROP COLUMN title')
    database.exec('ALTER TABLE articles DROP COLUMN body')
  }
}

export function useDb(): Database.Database {
  if (db) return db
  const path = dbPath()
  if (path !== ':memory:') {
    const dir = dirname(path)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  migrate(db)
  return db
}

export function resetDbForTests(): void {
  db = null
}
