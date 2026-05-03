#!/usr/bin/env node
'use strict';

/**
 * 既存の Excel 動物管理表を SQLite に取り込む。
 *
 * 使い方:
 *   node scripts/import-excel.js path/to/動物管理表.xlsx
 *
 * 注意:
 *   - 同じ日付がある場合は上書きします
 *   - 旧フォーマット（個体別列がない月）はメイン項目のみ取り込みます
 *   - 解析できない値はスキップしログに残します
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { initialize, getDb } = require('../lib/db');
const repo = require('../lib/repository');

function getCircleStatus(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (s === '⚪︎' || s === '○' || s === '◯' || s === 'O' || s === 'o') return 1;
  if (s === '×' || s === 'x' || s === 'X') return 0;
  return null;
}

function parseSheet(ws, sheetName) {
  // raw: false でフォーマット適用済み文字列、cellDates でDate objectに
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1, defval: '', blankrows: true, raw: false
  });
  if (!rows.length) return null;

  // 月の特定
  let yyyymm = null;
  let fullMaintDay = null;
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cell = (rows[i] || []).map(x => String(x || '')).join(' ');
    // パターン1: "2026年5月"
    const m1 = cell.match(/(20\d{2})年\s*(\d{1,2})月/);
    if (m1 && !yyyymm) {
      yyyymm = `${m1[1]}-${String(Number(m1[2])).padStart(2, '0')}`;
    }
    // パターン2: "5/1/26" (M/D/YY)
    if (!yyyymm) {
      const m2 = cell.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\b/);
      if (m2) {
        const yy = Number(m2[3]);
        const fullYear = yy < 50 ? 2000 + yy : 1900 + yy;
        yyyymm = `${fullYear}-${String(Number(m2[1])).padStart(2, '0')}`;
      }
    }
    const fm = cell.match(/フルメンテ[^0-9]*(\d{1,2})日/);
    if (fm) fullMaintDay = Number(fm[1]);
    // ヘッダ行検出（"日付" を含むセルがある最後のヘッダ）
    if (rows[i] && rows[i].some(c => String(c).trim() === '日付')) {
      headerRowIdx = i;
    }
  }
  // パターン3: シート名から推定 ("2605" → 2026-05)
  if (!yyyymm && sheetName) {
    const ms = String(sheetName).match(/^(\d{2})(\d{2})$/);
    if (ms) {
      yyyymm = `20${ms[1]}-${ms[2]}`;
    }
  }
  if (!yyyymm || headerRowIdx < 0) return null;

  // ヘッダから個体ごとの列位置を解析
  // 個体名は headerRow と同じ行（"日付,...,備考,ノブナガ：xxg,,," の形式）にある
  const animalNamesRow = rows[headerRowIdx] || [];
  const subHeaderRow = rows[headerRowIdx + 1] || [];

  // メイン列の位置（"日付" "記録時間" など）
  const headerRow = rows[headerRowIdx];
  const findCol = (label) => headerRow.findIndex(c => String(c).trim() === label);

  const colDate = findCol('日付');
  const colTime = findCol('記録時間');
  const colNotes = findCol('備考');
  const colStaff = findCol('担当者氏名');

  // 「使用施設の点検等の状況」セクション直下に 清掃/消毒/保守点検 が並ぶ
  // 「動物の点検」セクション直下に 数/状態/糞 が並ぶ
  // サブヘッダ行 (headerRow+1) を直接探す
  const colCleaning = subHeaderRow.findIndex(c => String(c).trim() === '清掃');
  const colDisinfection = subHeaderRow.findIndex(c => String(c).trim() === '消毒');
  const colMaintenance = subHeaderRow.findIndex(c => String(c).trim() === '保守点検');
  const colCount = subHeaderRow.findIndex(c => String(c).trim() === '数' || String(c).trim() === '数　');
  const colHealth = subHeaderRow.findIndex(c => String(c).trim() === '状態');
  const colPoop = subHeaderRow.findIndex(c => String(c).trim() === '糞');

  // 個体情報の列
  // 個体ごとに「給餌, 量, 糞」の3列が並ぶ
  const animals = [];
  for (let i = 0; i < subHeaderRow.length; i++) {
    if (String(subHeaderRow[i]).trim() === '給餌') {
      // 上の行から個体名を取得（"ノブナガ：63.26g" のような形式）
      let animalName = '';
      let weight = null;
      const cell = String(animalNamesRow[i] || '').trim();
      const mm = cell.match(/^([^：:]+)[：:]\s*([0-9.]+)?/);
      if (mm) {
        animalName = mm[1].trim();
        if (mm[2]) weight = parseFloat(mm[2]);
      } else if (cell) {
        animalName = cell;
      }
      if (animalName) {
        animals.push({ name: animalName, weight, colFood: i, colAmount: i + 1, colPoop: i + 2 });
      }
    }
  }

  // データ行
  const records = [];
  for (let i = headerRowIdx + 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const dateCell = r[colDate];
    const day = parseInt(dateCell, 10);
    if (!day || day < 1 || day > 31) continue;
    const dateStr = `${yyyymm}-${String(day).padStart(2, '0')}`;

    const rec = {
      record_date: dateStr,
      record_time: String(r[colTime] || '').trim() || null,
      cleaning: getCircleStatus(r[colCleaning]) ?? 1,
      disinfection: getCircleStatus(r[colDisinfection]) ?? 1,
      maintenance: getCircleStatus(r[colMaintenance]) ?? 1,
      count_status: String(r[colCount] || '').trim() || '変動なし',
      health_status: String(r[colHealth] || '').trim() || '良好',
      cleaning_status: String(r[colPoop] || '').trim() || '掃除済み',
      staff_name: String(r[colStaff] || '').trim() || null,
      notes: String(r[colNotes] || '').trim() || null,
      is_full_maintenance: fullMaintDay === day ? 1 : 0,
      animals: []
    };

    animals.forEach(a => {
      const foodText = String(r[a.colFood] || '').trim();
      const amount = String(r[a.colAmount] || '').trim();
      const poop = String(r[a.colPoop] || '').trim();
      if (!foodText && !amount && !poop) return;
      rec.animals.push({
        name: a.name,
        food_text: foodText,
        amount: amount || null,
        poop: poop || null,
        weight: a.weight
      });
    });

    // 完全に空の行（時間も担当者も個体記録もないもの）はスキップ
    const hasContent = rec.record_time || rec.staff_name ||
      rec.animals.length > 0 || rec.notes;
    if (hasContent) records.push(rec);
  }

  return { yyyymm, fullMaintDay, animals: animals.map(a => ({ name: a.name, weight: a.weight })), records };
}

async function importBook(filePath) {
  await initialize();
  const wb = XLSX.read(fs.readFileSync(filePath), { cellDates: true });
  const db = getDb();

  // 個体マスタ取得
  const animalIdByName = new Map();
  (await db.execute('SELECT id, name FROM animals')).rows
    .forEach(a => animalIdByName.set(a.name, Number(a.id)));

  // 餌マスタ
  const foodIdByName = new Map();
  (await db.execute('SELECT id, name FROM foods')).rows
    .forEach(f => foodIdByName.set(f.name, Number(f.id)));

  // 担当者マスタ
  const staffIdByName = new Map();
  (await db.execute('SELECT id, name FROM staff')).rows
    .forEach(s => staffIdByName.set(s.name, Number(s.id)));

  let totalRecords = 0;
  let totalSheets = 0;

  for (const sheetName of wb.SheetNames) {
    // テンプレートシートはスキップ
    if (/原本|template|sample/i.test(sheetName)) {
      console.log(`[skip] sheet "${sheetName}" - テンプレート`);
      continue;
    }
    const ws = wb.Sheets[sheetName];
    const parsed = parseSheet(ws, sheetName);
    if (!parsed) {
      console.log(`[skip] sheet "${sheetName}" - 解析できませんでした`);
      continue;
    }
    console.log(`[import] sheet "${sheetName}" → ${parsed.yyyymm} (${parsed.records.length} records, ${parsed.animals.length} animals)`);
    totalSheets++;

    // 個体マスタ追加
    for (const a of parsed.animals) {
      if (!animalIdByName.has(a.name)) {
        const id = await repo.upsertAnimal({ name: a.name, display_order: 99 });
        animalIdByName.set(a.name, id);
        console.log(`  + 個体マスタに追加: ${a.name}`);
      }
      if (a.weight && parsed.fullMaintDay) {
        const dt = `${parsed.yyyymm}-${String(parsed.fullMaintDay).padStart(2, '0')}`;
        const exists = (await db.execute({
          sql: 'SELECT id FROM weights WHERE animal_id = ? AND measured_at = ?',
          args: [animalIdByName.get(a.name), dt]
        })).rows[0];
        if (!exists) {
          await repo.addWeight({ animal_id: animalIdByName.get(a.name), measured_at: dt, weight_g: a.weight });
        }
      }
    }

    for (const rec of parsed.records) {
      let staff_id = null;
      if (rec.staff_name) {
        if (!staffIdByName.has(rec.staff_name)) {
          const id = await repo.upsertStaff({ name: rec.staff_name });
          staffIdByName.set(rec.staff_name, id);
        }
        staff_id = staffIdByName.get(rec.staff_name);
      }

      const feedings = [];
      for (const a of rec.animals) {
        const animal_id = animalIdByName.get(a.name);
        if (!animal_id) continue;
        const ft = a.food_text || '';
        const noFeed = !ft || /給餌なし/.test(ft);
        const foodNames = noFeed ? [] : ft.split(/[、,，\/]/).map(s => s.trim()).filter(Boolean);
        const food_ids = [];
        for (const fn of foodNames) {
          if (!foodIdByName.has(fn)) {
            const id = await repo.upsertFood({ name: fn, display_order: 99 });
            foodIdByName.set(fn, id);
          }
          food_ids.push(foodIdByName.get(fn));
        }
        feedings.push({
          animal_id,
          no_feeding: noFeed ? 1 : 0,
          food_ids,
          amount: a.amount,
          poop: a.poop
        });
      }

      try {
        await repo.upsertRecord({ ...rec, staff_id, feedings });
        totalRecords++;
      } catch (e) {
        console.error(`  [error] ${rec.record_date}: ${e.message}`);
      }
    }
  }

  console.log(`\n✅ 完了: ${totalSheets} シート、${totalRecords} 件の日次レコード取り込み`);
}

if (require.main === module) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('使い方: node scripts/import-excel.js <xlsxファイル>');
    process.exit(1);
  }
  importBook(path.resolve(arg)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { importBook, parseSheet };
