'use strict';

// @libsql/client ベースのDB接続
// ローカル開発: file:./data/animals.db （SQLiteファイル）
// 本番(Turso): libsql://xxx.turso.io + auth token
//
// 環境変数:
//   TURSO_DATABASE_URL - Turso のDB URL（指定なければローカル）
//   TURSO_AUTH_TOKEN   - Turso 認証トークン（リモート時のみ）

const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

const LOCAL_DB_PATH = path.join(__dirname, '..', 'data', 'animals.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

function ensureDataDir() {
  const dir = path.dirname(LOCAL_DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

let _db = null;
function getDb() {
  if (_db) return _db;

  const remoteUrl = process.env.TURSO_DATABASE_URL;
  const remoteToken = process.env.TURSO_AUTH_TOKEN;

  if (remoteUrl) {
    console.log('[db] Connecting to Turso:', remoteUrl.replace(/^(libsql:\/\/[^.]+).*/, '$1...'));
    _db = createClient({ url: remoteUrl, authToken: remoteToken });
  } else {
    ensureDataDir();
    console.log('[db] Using local SQLite:', LOCAL_DB_PATH);
    _db = createClient({ url: `file:${LOCAL_DB_PATH}` });
  }
  return _db;
}

async function applySchema(db) {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  // libsql doesn't allow multiple statements in one execute; split by ;
  const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(s => s.length);
  for (const stmt of statements) {
    try {
      await db.execute(stmt);
    } catch (e) {
      // CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS は既存でもOK
      if (!/already exists/.test(e.message)) throw e;
    }
  }
}

async function seedDefaults(db) {
  const animals = [
    'ノブナガ', 'もみじ', 'アリストテレス', 'テルース',
    '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'
  ];
  for (let i = 0; i < animals.length; i++) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO animals (name, display_order) VALUES (?, ?)',
      args: [animals[i], i + 1]
    });
  }

  const foods = [
    'ピンクマウス', 'イエコ', 'レッドローチ',
    'レオバイト', 'コオロギ', 'デュビア', 'ミルワーム'
  ];
  for (let i = 0; i < foods.length; i++) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO foods (name, display_order) VALUES (?, ?)',
      args: [foods[i], i + 1]
    });
  }

  const staff = ['永井', '島田', '森本', 'かとり'];
  for (const n of staff) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO staff (name) VALUES (?)',
      args: [n]
    });
  }
}

async function initialize() {
  const db = getDb();
  await applySchema(db);
  await seedDefaults(db);
  return db;
}

module.exports = { getDb, initialize, applySchema, seedDefaults, LOCAL_DB_PATH };
