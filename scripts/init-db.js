#!/usr/bin/env node
'use strict';
require('dotenv').config();
const { initialize, getDb, LOCAL_DB_PATH } = require('../lib/db');

(async () => {
  await initialize();
  const db = getDb();
  const animalCount = (await db.execute('SELECT COUNT(*) AS c FROM animals')).rows[0].c;
  const foodCount = (await db.execute('SELECT COUNT(*) AS c FROM foods')).rows[0].c;
  const staffCount = (await db.execute('SELECT COUNT(*) AS c FROM staff')).rows[0].c;
  console.log(`✅ データベース初期化完了`);
  if (!process.env.TURSO_DATABASE_URL) console.log(`   path: ${LOCAL_DB_PATH}`);
  console.log(`   個体: ${animalCount} 件`);
  console.log(`   餌マスタ: ${foodCount} 件`);
  console.log(`   担当者: ${staffCount} 件`);
})().catch(e => { console.error(e); process.exit(1); });
