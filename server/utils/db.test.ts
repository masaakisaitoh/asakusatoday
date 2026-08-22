import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

beforeEach(() => {
  process.env.DATABASE_PATH = ':memory:'
})

describe('useDb', () => {
  it('creates users, nonces, sessions, sources, articles tables', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row: any) => row.name)
    expect(tables).toEqual(
      expect.arrayContaining(['users', 'nonces', 'sessions', 'sources', 'articles'])
    )
  })

  it('creates an article_sources table', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row: any) => row.name)
    expect(tables).toContain('article_sources')
  })

  it('creates an articles table with a category column', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const columns = db.prepare('PRAGMA table_info(articles)').all() as { name: string }[]
    expect(columns.some((c) => c.name === 'category')).toBe(true)
    expect(columns.some((c) => c.name === 'source_url')).toBe(false)
  })

  it('creates an article_translations table', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row: any) => row.name)
    expect(tables).toContain('article_translations')
  })

  it('creates an articles table without title/body columns', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const columns = db.prepare('PRAGMA table_info(articles)').all() as { name: string }[]
    expect(columns.some((c) => c.name === 'title')).toBe(false)
    expect(columns.some((c) => c.name === 'body')).toBe(false)
  })

  it('creates a fresh users table with an is_admin column', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const columns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[]
    expect(columns.some((c) => c.name === 'is_admin')).toBe(true)
  })

  it('creates a fresh users table with a theme column defaulting to light', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const columns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[]
    expect(columns.some((c) => c.name === 'theme')).toBe(true)

    db.prepare(
      `INSERT INTO users (address, public_key, user_name, avatar_seed, created_at)
       VALUES ('addr-theme', 'pub-theme', 'ThemeUser00000001', 'seed-theme', datetime('now'))`
    ).run()
    const user = db.prepare('SELECT theme FROM users WHERE address = ?').get('addr-theme') as { theme: string }
    expect(user.theme).toBe('light')
  })

  it('migrates an existing users table without is_admin', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'asakusa-migrate-'))
    const path = join(dir, 'legacy.sqlite3')

    const legacyDb = new Database(path)
    legacyDb.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        address TEXT UNIQUE NOT NULL,
        public_key TEXT NOT NULL,
        user_name TEXT UNIQUE NOT NULL,
        gender TEXT,
        birth_year INTEGER,
        nationality TEXT,
        avatar_seed TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)
    legacyDb
      .prepare(
        `INSERT INTO users (address, public_key, user_name, avatar_seed, created_at)
         VALUES ('addr1', 'pub1', 'LegacyUser000001', 'seed1', datetime('now'))`
      )
      .run()
    legacyDb.close()

    process.env.DATABASE_PATH = path
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()

    const columns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[]
    expect(columns.some((c) => c.name === 'is_admin')).toBe(true)

    const user = db.prepare('SELECT is_admin FROM users WHERE address = ?').get('addr1') as {
      is_admin: number
    }
    expect(user.is_admin).toBe(0)

    rmSync(dir, { recursive: true, force: true })
  })

  it('migrates an existing users table without theme to default light', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'asakusa-migrate-theme-'))
    const path = join(dir, 'legacy.sqlite3')

    const legacyDb = new Database(path)
    legacyDb.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        address TEXT UNIQUE NOT NULL,
        public_key TEXT NOT NULL,
        user_name TEXT UNIQUE NOT NULL,
        gender TEXT,
        birth_year INTEGER,
        nationality TEXT,
        avatar_seed TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `)
    legacyDb
      .prepare(
        `INSERT INTO users (address, public_key, user_name, avatar_seed, created_at)
         VALUES ('addr2', 'pub2', 'LegacyUser000002', 'seed2', datetime('now'))`
      )
      .run()
    legacyDb.close()

    process.env.DATABASE_PATH = path
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()

    const columns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[]
    expect(columns.some((c) => c.name === 'theme')).toBe(true)

    const user = db.prepare('SELECT theme FROM users WHERE address = ?').get('addr2') as { theme: string }
    expect(user.theme).toBe('light')

    rmSync(dir, { recursive: true, force: true })
  })

  it('migrates an existing articles table with title/body into article_translations as ja', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'asakusa-migrate-articles-'))
    const path = join(dir, 'legacy.sqlite3')

    const legacyDb = new Database(path)
    legacyDb.exec(`
      CREATE TABLE articles (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        image_url TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        category TEXT NOT NULL,
        published_at TEXT,
        created_at TEXT NOT NULL
      );
    `)
    legacyDb
      .prepare(
        `INSERT INTO articles (title, body, status, category, created_at)
         VALUES ('レガシータイトル', 'レガシー本文', 'published', 'traffic', datetime('now'))`
      )
      .run()
    legacyDb.close()

    process.env.DATABASE_PATH = path
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()

    const columns = db.prepare('PRAGMA table_info(articles)').all() as { name: string }[]
    expect(columns.some((c) => c.name === 'title')).toBe(false)
    expect(columns.some((c) => c.name === 'body')).toBe(false)

    const translation = db
      .prepare(`SELECT article_id, title, body FROM article_translations WHERE locale = 'ja'`)
      .get() as { article_id: number; title: string; body: string }
    expect(translation.title).toBe('レガシータイトル')
    expect(translation.body).toBe('レガシー本文')

    rmSync(dir, { recursive: true, force: true })
  })
})
