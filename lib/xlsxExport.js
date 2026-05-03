'use strict';

// XLSX 月次エクスポート（async版）
const XLSX = require('xlsx');
const { getDb } = require('./db');

async function buildSheetForMonth(yyyymm) {
  const db = getDb();
  const [y, m] = yyyymm.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();

  const animals = (await db.execute(
    'SELECT id, name FROM animals WHERE active = 1 ORDER BY display_order'
  )).rows;

  const head1 = ['日付', '記録時間', '清掃', '消毒', '保守点検', '数', '状態', '糞', '担当者', '備考'];
  animals.forEach(a => head1.push(a.name, '', ''));
  const head2 = ['', '', '', '', '', '', '', '', '', ''];
  animals.forEach(() => head2.push('給餌', '量', '糞'));

  const rows = [[`${yyyymm} 動物管理表`], head1, head2];

  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${yyyymm}-${String(d).padStart(2, '0')}`;
    const rec = (await db.execute({
      sql: `SELECT d.*, s.name AS staff_name FROM daily_records d
            LEFT JOIN staff s ON s.id = d.staff_id WHERE record_date = ?`,
      args: [dateStr]
    })).rows[0];

    const row = [d];
    if (!rec) {
      while (row.length < head1.length) row.push('');
      rows.push(row);
      continue;
    }
    row.push(
      rec.record_time || '',
      rec.cleaning ? '⚪︎' : '×',
      rec.disinfection ? '⚪︎' : '×',
      rec.maintenance ? '⚪︎' : '×',
      rec.count_status || '',
      rec.health_status || '',
      rec.cleaning_status || '',
      rec.staff_name || '',
      rec.notes || ''
    );

    for (const a of animals) {
      const fr = (await db.execute({
        sql: 'SELECT * FROM feeding_records WHERE daily_record_id = ? AND animal_id = ?',
        args: [rec.id, a.id]
      })).rows[0];
      if (!fr) {
        row.push('', '', '');
      } else {
        const foods = (await db.execute({
          sql: `SELECT fo.name FROM feeding_foods ff
                JOIN foods fo ON fo.id = ff.food_id
                WHERE ff.feeding_record_id = ?`,
          args: [fr.id]
        })).rows.map(x => x.name).join('、');
        row.push(
          fr.no_feeding ? '給餌なし' : (foods || '給餌'),
          fr.amount || '',
          fr.poop || ''
        );
      }
    }
    rows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = head1.map((_, i) => ({ wch: i === 9 ? 25 : 12 }));
  return ws;
}

async function exportMonth(yyyymm) {
  const wb = XLSX.utils.book_new();
  const ws = await buildSheetForMonth(yyyymm);
  XLSX.utils.book_append_sheet(wb, ws, yyyymm);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function exportAll() {
  const db = getDb();
  const months = (await db.execute(
    `SELECT DISTINCT substr(record_date, 1, 7) AS ym
     FROM daily_records ORDER BY ym DESC`
  )).rows.map(r => r.ym);

  const wb = XLSX.utils.book_new();

  // 個体マスタシート
  const animals = (await db.execute('SELECT * FROM animals ORDER BY display_order')).rows;
  const animalRows = [
    ['ID', '名前', '性別', 'カテゴリ', 'モルフ', '系統', '生年月日', '有効', 'メモ', '写真URL']
  ];
  animals.forEach(a => animalRows.push([
    Number(a.id), a.name, a.sex, a.category, a.morph || '', a.lineage || '',
    a.birth_date || '', a.active ? '有効' : '無効', a.notes || '', a.photo_url || ''
  ]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(animalRows), '個体マスタ');

  if (months.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['データがありません']]), '記録');
  } else {
    for (const ym of months) {
      XLSX.utils.book_append_sheet(wb, await buildSheetForMonth(ym), ym);
    }
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { exportMonth, exportAll };
