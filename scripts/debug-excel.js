#!/usr/bin/env node
'use strict';
// 1シート目を取り出して構造を見る
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const file = process.argv[2];
if (!file) { console.error('使い方: node scripts/debug-excel.js <xlsx>'); process.exit(1); }
const wb = XLSX.read(fs.readFileSync(path.resolve(file)));
console.log('Sheets:', wb.SheetNames);
const target = wb.SheetNames.find(s => s.includes('2605')) || wb.SheetNames[0];
console.log('--- target sheet:', target);
const ws = wb.Sheets[target];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true });
console.log('rows count:', rows.length);
for (let i = 0; i < Math.min(rows.length, 12); i++) {
  console.log(`row[${i}] (cells=${rows[i].length}):`, JSON.stringify(rows[i].slice(0, 20)));
}
