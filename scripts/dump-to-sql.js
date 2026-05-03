#!/usr/bin/env node
'use strict';
// ローカル data/animals.db → Turso にインポートするためのSQLダンプを生成
// 出力: data/dump.sql
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

const LOCAL = path.join(__dirname, '..', 'data', 'animals.db');
const OUT = path.join(__dirname, '..', 'data', 'dump.sql');

if (!fs.existsSync(LOCAL)) {
  console.error('ローカルDBがありません:', LOCAL);
  process.exit(1);
}

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'bigint') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  // string
  return `'${String(v).replace(/'/g, "''")}'`;
}

(async () => {
  const db = createClient({ url: `file:${LOCAL}` });

  const tables = [
    'animals', 'staff', 'foods',
    'daily_records', 'feeding_records', 'feeding_foods',
    'weights', 'notification_log', 'settings'
  ];

  let sql = '-- レオパ管理表 データダンプ\nPRAGMA foreign_keys = OFF;\n\n';

  for (const t of tables) {
    let exists = true;
    try {
      await db.execute(`SELECT 1 FROM ${t} LIMIT 1`);
    } catch (e) {
      console.log(`[skip] ${t} はまだ存在しません`);
      exists = false;
      continue;
    }

    const cols = (await db.execute(`PRAGMA table_info(${t})`)).rows.map(c => c.name);
    const rows = (await db.execute(`SELECT * FROM ${t}`)).rows;
    sql += `-- ${t}: ${rows.length}件\n`;
    sql += `DELETE FROM ${t};\n`;
    for (const r of rows) {
      const vals = cols.map(c => esc(r[c])).join(', ');
      sql += `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${vals});\n`;
    }
    sql += '\n';
  }

  sql += 'PRAGMA foreign_keys = ON;\n';

  fs.writeFileSync(OUT, sql);
  console.log(`✅ ダンプ完了: ${OUT}`);
  console.log(`   サイズ: ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
})().catch(e => { console.error(e); process.exit(1); });
