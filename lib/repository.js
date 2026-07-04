'use strict';

// @libsql/client ベースのデータアクセス層（全 async）
const { getDb } = require('./db');

// 共通ヘルパ
async function all(sql, args = []) {
  const r = await getDb().execute({ sql, args });
  return r.rows;
}
async function one(sql, args = []) {
  const r = await getDb().execute({ sql, args });
  return r.rows[0] || null;
}
async function exec(sql, args = []) {
  return await getDb().execute({ sql, args });
}

// =========================
// 個体マスタ
// =========================
async function listAnimals({ activeOnly = true } = {}) {
  const where = activeOnly ? 'WHERE active = 1' : '';
  return all(
    `SELECT a.*,
       (SELECT weight_g FROM weights w WHERE w.animal_id = a.id ORDER BY measured_at DESC LIMIT 1) AS latest_weight,
       (SELECT measured_at FROM weights w WHERE w.animal_id = a.id ORDER BY measured_at DESC LIMIT 1) AS latest_weight_date,
       (SELECT weight_g FROM weights w WHERE w.animal_id = a.id ORDER BY measured_at DESC LIMIT 1 OFFSET 1) AS previous_weight,
       (SELECT measured_at FROM weights w WHERE w.animal_id = a.id ORDER BY measured_at DESC LIMIT 1 OFFSET 1) AS previous_weight_date
     FROM animals a
     ${where}
     ORDER BY display_order, id`
  );
}

async function upsertAnimal(payload) {
  const {
    id, name, display_order = 0, active = 1, notes,
    sex = 'U', category = 'named', morph, lineage, birth_date,
    photo_url, source_url
  } = payload;

  if (id) {
    await exec(
      `UPDATE animals SET
         name=?, display_order=?, active=?, notes=?,
         sex=?, category=?, morph=?, lineage=?, birth_date=?,
         photo_url=?, source_url=?
       WHERE id=?`,
      [name, display_order, active ? 1 : 0, notes ?? null,
       sex, category, morph ?? null, lineage ?? null, birth_date ?? null,
       photo_url ?? null, source_url ?? null, id]
    );
    return id;
  }
  const r = await exec(
    `INSERT INTO animals
       (name, display_order, active, notes, sex, category, morph, lineage, birth_date, photo_url, source_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, display_order, active ? 1 : 0, notes ?? null,
     sex, category, morph ?? null, lineage ?? null, birth_date ?? null,
     photo_url ?? null, source_url ?? null]
  );
  return Number(r.lastInsertRowid);
}

async function deactivateAnimal(id) {
  await exec('UPDATE animals SET active=0 WHERE id=?', [id]);
}

async function activateAnimal(id) {
  await exec('UPDATE animals SET active=1 WHERE id=?', [id]);
}

async function reorderAnimals(items) {
  // libsql には transaction がないので個別実行（小規模なのでOK）
  for (const { id, display_order } of items) {
    await exec('UPDATE animals SET display_order = ? WHERE id = ?', [display_order, id]);
  }
}

// =========================
// 体重
// =========================
async function addWeight({ animal_id, measured_at, weight_g, notes }) {
  const r = await exec(
    'INSERT INTO weights (animal_id, measured_at, weight_g, notes) VALUES (?, ?, ?, ?)',
    [animal_id, measured_at, weight_g, notes ?? null]
  );
  return Number(r.lastInsertRowid);
}

async function getWeights(animal_id) {
  return all('SELECT * FROM weights WHERE animal_id=? ORDER BY measured_at ASC', [animal_id]);
}

// =========================
// 餌マスタ
// =========================
async function listFoods({ activeOnly = true } = {}) {
  const where = activeOnly ? 'WHERE active = 1' : '';
  return all(`SELECT * FROM foods ${where} ORDER BY display_order, id`);
}

async function upsertFood({ id, name, display_order = 0, active = 1 }) {
  if (id) {
    await exec('UPDATE foods SET name=?, display_order=?, active=? WHERE id=?',
      [name, display_order, active ? 1 : 0, id]);
    return id;
  }
  const r = await exec(
    'INSERT INTO foods (name, display_order, active) VALUES (?, ?, ?)',
    [name, display_order, active ? 1 : 0]
  );
  return Number(r.lastInsertRowid);
}

async function deactivateFood(id) {
  await exec('UPDATE foods SET active=0 WHERE id=?', [id]);
}

async function activateFood(id) {
  await exec('UPDATE foods SET active=1 WHERE id=?', [id]);
}

// =========================
// 担当者
// =========================
async function listStaff({ activeOnly = true } = {}) {
  const where = activeOnly ? 'WHERE active = 1' : '';
  return all(`SELECT * FROM staff ${where} ORDER BY id`);
}

async function upsertStaff({ id, name, active = 1 }) {
  if (id) {
    await exec('UPDATE staff SET name=?, active=? WHERE id=?', [name, active ? 1 : 0, id]);
    return id;
  }
  const r = await exec('INSERT INTO staff (name, active) VALUES (?, ?)', [name, active ? 1 : 0]);
  return Number(r.lastInsertRowid);
}

async function deactivateStaff(id) {
  await exec('UPDATE staff SET active=0 WHERE id=?', [id]);
}

async function activateStaff(id) {
  await exec('UPDATE staff SET active=1 WHERE id=?', [id]);
}

// =========================
// 日次レコード
// =========================
async function getRecord(date) {
  const daily = await one(
    `SELECT d.*, s.name AS staff_name
     FROM daily_records d LEFT JOIN staff s ON s.id = d.staff_id
     WHERE record_date = ?`, [date]
  );
  if (!daily) return null;

  const feedings = await all(
    `SELECT f.*, a.name AS animal_name, a.display_order
     FROM feeding_records f
     JOIN animals a ON a.id = f.animal_id
     WHERE daily_record_id = ?
     ORDER BY a.display_order`, [daily.id]
  );

  for (const f of feedings) {
    f.foods = await all(
      `SELECT ff.feeding_record_id, fo.id AS food_id, fo.name AS food_name
       FROM feeding_foods ff JOIN foods fo ON fo.id = ff.food_id
       WHERE ff.feeding_record_id = ?`, [f.id]
    );
  }
  daily.feedings = feedings;
  return daily;
}

async function upsertRecord(p) {
  // 共通項目
  const existing = await one('SELECT id FROM daily_records WHERE record_date = ?', [p.record_date]);
  let dailyId;
  if (existing) {
    await exec(
      `UPDATE daily_records SET
         record_time=?, cleaning=?, disinfection=?, maintenance=?, shelter_wash=?,
         count_status=?, health_status=?, cleaning_status=?,
         staff_id=?, notes=?, is_full_maintenance=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
      [p.record_time ?? null, p.cleaning ? 1 : 0, p.disinfection ? 1 : 0, p.maintenance ? 1 : 0,
       p.shelter_wash ? 1 : 0,
       p.count_status ?? '変動なし', p.health_status ?? '良好',
       p.cleaning_status ?? '掃除済み', p.staff_id ?? null,
       p.notes ?? null, p.is_full_maintenance ? 1 : 0, existing.id]
    );
    dailyId = existing.id;
  } else {
    const r = await exec(
      `INSERT INTO daily_records (
         record_date, record_time, cleaning, disinfection, maintenance, shelter_wash,
         count_status, health_status, cleaning_status,
         staff_id, notes, is_full_maintenance
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.record_date, p.record_time ?? null,
       p.cleaning ? 1 : 0, p.disinfection ? 1 : 0, p.maintenance ? 1 : 0, p.shelter_wash ? 1 : 0,
       p.count_status ?? '変動なし', p.health_status ?? '良好',
       p.cleaning_status ?? '掃除済み', p.staff_id ?? null,
       p.notes ?? null, p.is_full_maintenance ? 1 : 0]
    );
    dailyId = Number(r.lastInsertRowid);
  }

  // 個体別
  for (const f of (p.feedings || [])) {
    await exec(
      `INSERT INTO feeding_records
         (daily_record_id, animal_id, no_feeding, amount, poop, notes)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(daily_record_id, animal_id) DO UPDATE SET
         no_feeding = excluded.no_feeding,
         amount = excluded.amount,
         poop = excluded.poop,
         notes = excluded.notes`,
      [dailyId, f.animal_id, f.no_feeding ? 1 : 0,
       f.amount ?? null, f.poop ?? null, f.notes ?? null]
    );
    const row = await one(
      'SELECT id FROM feeding_records WHERE daily_record_id = ? AND animal_id = ?',
      [dailyId, f.animal_id]
    );
    if (row) {
      await exec('DELETE FROM feeding_foods WHERE feeding_record_id = ?', [row.id]);
      for (const fid of (f.food_ids || [])) {
        await exec(
          'INSERT OR IGNORE INTO feeding_foods (feeding_record_id, food_id) VALUES (?, ?)',
          [row.id, fid]
        );
      }
    }
  }

  // 体重
  for (const w of (p.weights || [])) {
    if (w.weight_g != null && w.weight_g !== '') {
      await exec('DELETE FROM weights WHERE animal_id = ? AND measured_at = ?',
        [w.animal_id, p.record_date]);
      await exec('INSERT INTO weights (animal_id, measured_at, weight_g) VALUES (?, ?, ?)',
        [w.animal_id, p.record_date, parseFloat(w.weight_g)]);
    }
  }
  return dailyId;
}

async function listRecordsByMonth(yyyymm) {
  const start = `${yyyymm}-01`;
  const [y, m] = yyyymm.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${yyyymm}-${String(lastDay).padStart(2, '0')}`;

  return all(
    `SELECT d.record_date, d.record_time, d.cleaning, d.disinfection, d.maintenance, d.shelter_wash,
            d.count_status, d.health_status, d.cleaning_status,
            d.is_full_maintenance, d.notes, s.name AS staff_name,
            (SELECT COUNT(*) FROM feeding_records fr WHERE fr.daily_record_id = d.id AND fr.no_feeding = 0) AS fed_count
     FROM daily_records d LEFT JOIN staff s ON s.id = d.staff_id
     WHERE record_date BETWEEN ? AND ?
     ORDER BY record_date`, [start, end]
  );
}

async function getRecentRecord(beforeDate) {
  const r = await one(
    'SELECT record_date FROM daily_records WHERE record_date < ? ORDER BY record_date DESC LIMIT 1',
    [beforeDate]
  );
  if (!r) return null;
  return await getRecord(r.record_date);
}

async function getAnimalHistory(animal_id, fromDate, toDate) {
  const rows = await all(
    `SELECT d.record_date, fr.no_feeding, fr.amount, fr.poop, fr.notes
     FROM feeding_records fr
     JOIN daily_records d ON d.id = fr.daily_record_id
     WHERE fr.animal_id = ? AND d.record_date BETWEEN ? AND ?
     ORDER BY d.record_date`, [animal_id, fromDate, toDate]
  );
  for (const r of rows) {
    const foods = await all(
      `SELECT fo.name FROM feeding_foods ff
       JOIN foods fo ON fo.id = ff.food_id
       JOIN feeding_records fr ON fr.id = ff.feeding_record_id
       JOIN daily_records d ON d.id = fr.daily_record_id
       WHERE fr.animal_id = ? AND d.record_date = ?`, [animal_id, r.record_date]
    );
    r.foods = foods.map(x => x.name);
  }
  return rows;
}

// =========================
// アラート判定
// =========================
async function findAnimalsNotEatingFor(days = 7, asOfDate = null) {
  const today = asOfDate || new Date().toISOString().slice(0, 10);
  const since = new Date(today);
  since.setDate(since.getDate() - (days - 1));
  const sinceStr = since.toISOString().slice(0, 10);

  const animals = await all('SELECT id, name FROM animals WHERE active = 1 ORDER BY display_order');
  const result = [];
  for (const a of animals) {
    const fed = await one(
      `SELECT COUNT(*) AS c FROM feeding_records fr
       JOIN daily_records d ON d.id = fr.daily_record_id
       WHERE fr.animal_id = ? AND d.record_date BETWEEN ? AND ? AND fr.no_feeding = 0`,
      [a.id, sinceStr, today]
    );
    if (Number(fed.c) === 0) {
      const last = await one(
        `SELECT d.record_date FROM feeding_records fr
         JOIN daily_records d ON d.id = fr.daily_record_id
         WHERE fr.animal_id = ? AND fr.no_feeding = 0
         ORDER BY d.record_date DESC LIMIT 1`, [a.id]
      );
      result.push({
        animal_id: Number(a.id),
        animal_name: a.name,
        last_fed_date: last ? last.record_date : null,
        days_since_fed: last
          ? Math.floor((new Date(today) - new Date(last.record_date)) / (1000 * 60 * 60 * 24))
          : null
      });
    }
  }
  return result;
}

async function findMissingRecord(date) {
  const r = await one('SELECT * FROM daily_records WHERE record_date = ?', [date]);
  if (!r) return { missing: true, reasons: ['その日の記録自体が未入力'] };

  const reasons = [];
  if (!r.staff_id) reasons.push('担当者未入力');
  if (!r.record_time) reasons.push('記録時間未入力');

  const animals = await all('SELECT id, name FROM animals WHERE active = 1');
  const recordedRows = await all(
    'SELECT animal_id FROM feeding_records WHERE daily_record_id = ?', [r.id]
  );
  const recordedIds = new Set(recordedRows.map(x => Number(x.animal_id)));
  const missingAnimals = animals.filter(a => !recordedIds.has(Number(a.id)));
  if (missingAnimals.length) {
    reasons.push(`個体別記録なし: ${missingAnimals.map(a => a.name).join('、')}`);
  }
  return { missing: reasons.length > 0, reasons };
}

async function logNotification({ notification_type, target_date, target_animal_id, message, success = true }) {
  const r = await exec(
    `INSERT INTO notification_log
       (notification_type, target_date, target_animal_id, message, success)
     VALUES (?, ?, ?, ?, ?)`,
    [notification_type, target_date ?? null, target_animal_id ?? null, message, success ? 1 : 0]
  );
  return Number(r.lastInsertRowid);
}

async function alreadyNotified({ notification_type, target_date, target_animal_id }) {
  const row = await one(
    `SELECT id FROM notification_log
     WHERE notification_type = ?
       AND IFNULL(target_date, '') = IFNULL(?, '')
       AND IFNULL(target_animal_id, 0) = IFNULL(?, 0)
       AND success = 1`,
    [notification_type, target_date ?? null, target_animal_id ?? null]
  );
  return !!row;
}

module.exports = {
  listAnimals, upsertAnimal, deactivateAnimal, activateAnimal, reorderAnimals,
  addWeight, getWeights,
  listFoods, upsertFood, deactivateFood, activateFood,
  deactivateStaff, activateStaff,
  listStaff, upsertStaff,
  getRecord, upsertRecord, listRecordsByMonth, getRecentRecord, getAnimalHistory,
  findAnimalsNotEatingFor, findMissingRecord,
  logNotification, alreadyNotified
};
