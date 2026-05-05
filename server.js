'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');
const cron = require('node-cron');

const { initialize } = require('./lib/db');
const repo = require('./lib/repository');
const alerts = require('./lib/alerts');

const app = express();
app.use(express.json({ limit: '2mb' }));

// 検索エンジン除外用ヘッダ
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});

// robots.txt
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

app.use(express.static(path.join(__dirname, 'public')));

// async handler ラッパー
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ================================================================
// マスタAPI
// ================================================================
app.get('/api/animals', wrap(async (req, res) => {
  res.json(await repo.listAnimals({ activeOnly: req.query.all !== '1' }));
}));
app.post('/api/animals', wrap(async (req, res) => {
  res.json({ id: await repo.upsertAnimal(req.body) });
}));
app.delete('/api/animals/:id', wrap(async (req, res) => {
  await repo.deactivateAnimal(Number(req.params.id));
  res.json({ ok: true });
}));
app.post('/api/animals/reorder', wrap(async (req, res) => {
  await repo.reorderAnimals(req.body.items || []);
  res.json({ ok: true });
}));

app.get('/api/foods', wrap(async (req, res) => {
  res.json(await repo.listFoods({ activeOnly: req.query.all !== '1' }));
}));
app.post('/api/foods', wrap(async (req, res) => {
  res.json({ id: await repo.upsertFood(req.body) });
}));

app.get('/api/staff', wrap(async (req, res) => {
  res.json(await repo.listStaff({ activeOnly: req.query.all !== '1' }));
}));
app.post('/api/staff', wrap(async (req, res) => {
  res.json({ id: await repo.upsertStaff(req.body) });
}));

// ================================================================
// 日次レコード
// ================================================================
app.get('/api/records/:date', wrap(async (req, res) => {
  res.json(await repo.getRecord(req.params.date) || null);
}));

app.post('/api/records', wrap(async (req, res) => {
  const id = await repo.upsertRecord(req.body);
  res.json({ id, record_date: req.body.record_date });
}));

app.get('/api/month/:yyyymm', wrap(async (req, res) => {
  res.json(await repo.listRecordsByMonth(req.params.yyyymm));
}));

app.get('/api/records/previous-of/:date', wrap(async (req, res) => {
  res.json(await repo.getRecentRecord(req.params.date) || null);
}));

app.get('/api/individual/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const fromDate = req.query.from || oneYearAgo.toISOString().slice(0, 10);
  const toDate = req.query.to || today.toISOString().slice(0, 10);
  res.json({
    history: await repo.getAnimalHistory(id, fromDate, toDate),
    weights: await repo.getWeights(id)
  });
}));

// ================================================================
// アラート / 通知
// ================================================================
app.get('/api/alerts/long-term', wrap(async (req, res) => {
  const days = Number(req.query.days || 7);
  const asOf = req.query.date || null;
  res.json(await repo.findAnimalsNotEatingFor(days, asOf));
}));

app.get('/api/alerts/missing/:date', wrap(async (req, res) => {
  res.json(await repo.findMissingRecord(req.params.date));
}));

app.post('/api/notify/test', wrap(async (req, res) => {
  res.json(await alerts.sendTest({ dryRun: req.query.dry === '1' }));
}));

app.post('/api/notify/run', wrap(async (req, res) => {
  const dryRun = req.query.dry === '1';
  const asOfDate = req.query.date || null;
  const long = await alerts.checkLongTermFoodAlerts({ dryRun, asOfDate });
  const miss = await alerts.checkMissingRecords({ dryRun, asOfDate });
  res.json({ long, miss, asOfDate: asOfDate || new Date().toISOString().slice(0, 10) });
}));

// GET でも呼べるようにする（cronサービスから簡単にアクセスできるように）
app.get('/api/notify/run', wrap(async (req, res) => {
  const dryRun = req.query.dry === '1';
  const asOfDate = req.query.date || null;
  const long = await alerts.checkLongTermFoodAlerts({ dryRun, asOfDate });
  const miss = await alerts.checkMissingRecords({ dryRun, asOfDate });
  res.json({ long, miss, asOfDate: asOfDate || new Date().toISOString().slice(0, 10) });
}));

// ヘルスチェック（uptime用）
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ================================================================
// CSV / XLSX エクスポート
// ================================================================
app.get('/api/export/:yyyymm.csv', wrap(async (req, res) => {
  const yyyymm = req.params.yyyymm;
  const csv = await require('./lib/csvExport').exportMonth(yyyymm);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="動物管理表_${yyyymm}.csv"`);
  res.write('﻿');
  res.end(csv);
}));

app.get('/api/export/:yyyymm.xlsx', wrap(async (req, res) => {
  const buf = await require('./lib/xlsxExport').exportMonth(req.params.yyyymm);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="動物管理表_${req.params.yyyymm}.xlsx"`);
  res.end(buf);
}));

app.get('/api/export/all.xlsx', wrap(async (req, res) => {
  const buf = await require('./lib/xlsxExport').exportAll();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="動物管理表_全期間.xlsx"`);
  res.end(buf);
}));

// ダッシュボード
app.get('/api/dashboard', wrap(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const todayRecord = await repo.getRecord(today);
  const longTerm = await repo.findAnimalsNotEatingFor(7, today);
  const missing = await repo.findMissingRecord(today);
  res.json({ today, todayRecord, longTerm, missing });
}));

// エラーハンドリング
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message });
});

// ================================================================
// 内蔵スケジューラ
// ================================================================
const morning = process.env.NOTIFY_MORNING_CRON || '0 9 * * *';
const evening = process.env.NOTIFY_EVENING_CRON || '0 20 * * *';
function scheduleNotifications() {
  if (cron.validate(morning)) {
    cron.schedule(morning, async () => {
      try { await alerts.checkLongTermFoodAlerts(); }
      catch (e) { console.error(e); }
    }, { timezone: 'Asia/Tokyo' });
  }
  if (cron.validate(evening)) {
    cron.schedule(evening, async () => {
      try { await alerts.checkMissingRecords(); }
      catch (e) { console.error(e); }
    }, { timezone: 'Asia/Tokyo' });
  }
}

const PORT = process.env.PORT || 3000;
(async () => {
  try {
    await initialize();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🦎 Leopard Manager 起動: http://localhost:${PORT}`);
      console.log(`   通知（朝）: ${morning}`);
      console.log(`   通知（夜）: ${evening}`);
      scheduleNotifications();
    });
  } catch (e) {
    console.error('起動エラー:', e);
    process.exit(1);
  }
})();
