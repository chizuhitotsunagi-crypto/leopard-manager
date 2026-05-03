'use strict';

// 既存Excelレイアウトに近い CSV を生成（async版）
const { getDb } = require('./db');

async function exportMonth(yyyymm) {
  const db = getDb();
  const [y, m] = yyyymm.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();

  const animals = (await db.execute(
    'SELECT id, name FROM animals WHERE active = 1 ORDER BY display_order'
  )).rows;

  const headerRow1 = ['日付', '記録時間', '清掃', '消毒', '保守点検', '数', '状態', '糞', '担当者', '備考'];
  animals.forEach(a => headerRow1.push(a.name, '', ''));
  const headerRow2 = ['', '', '', '', '', '', '', '', '', ''];
  animals.forEach(() => headerRow2.push('給餌', '量', '糞'));

  const rows = [
    [`${yyyymm} 動物管理表`],
    headerRow1,
    headerRow2
  ];

  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${yyyymm}-${String(d).padStart(2, '0')}`;
    const recRes = await db.execute({
      sql: `SELECT d.*, s.name AS staff_name FROM daily_records d
            LEFT JOIN staff s ON s.id = d.staff_id WHERE record_date = ?`,
      args: [dateStr]
    });
    const rec = recRes.rows[0];

    const row = [d];
    if (!rec) {
      while (row.length < headerRow1.length) row.push('');
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

  return rows.map(r => r.map(escape).join(',')).join('\r\n');
}

function escape(v) {
  const s = (v ?? '').toString();
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

module.exports = { exportMonth };
