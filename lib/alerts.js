'use strict';

// アラート判定 + 通知発行
const repo = require('./repository');
const { sendMessage } = require('./chatwork');

function getEnv() {
  return {
    token: process.env.CHATWORK_API_TOKEN,
    roomId: process.env.CHATWORK_ROOM_ID,
    mentionIds: (process.env.CHATWORK_MENTION_IDS || '')
      .split(',').map(s => s.trim()).filter(Boolean),
    enabled: process.env.NOTIFY_ENABLED !== 'false'
  };
}

async function notify(body, { dryRun = false } = {}) {
  const env = getEnv();
  if (dryRun || !env.enabled) {
    console.log('[notify:dryrun]', body);
    return { dryRun: true };
  }
  if (!env.token || !env.roomId) {
    console.log('[notify:skip] Chatwork 未設定。本文:', body);
    return { skipped: true };
  }
  return sendMessage({ token: env.token, roomId: env.roomId, body, mentionIds: env.mentionIds });
}

// =========================
// 1: 1週間給餌なし
// =========================
async function checkLongTermFoodAlerts({ days = 7, asOfDate = null, dryRun = false } = {}) {
  const today = asOfDate || new Date().toISOString().slice(0, 10);
  const targets = await repo.findAnimalsNotEatingFor(days, today);
  const results = [];

  for (const t of targets) {
    if (await repo.alreadyNotified({
      notification_type: 'no_feeding_7days',
      target_date: today,
      target_animal_id: t.animal_id
    })) continue;

    const lastFed = t.last_fed_date
      ? `（最後の摂食: ${t.last_fed_date}、${t.days_since_fed}日経過）`
      : '（直近の摂食記録なし）';
    const body = `[info][title]🦎 摂食アラート[/title]${t.animal_name} が ${days}日間 給餌なしです${lastFed}
状態を確認してください。[/info]`;
    try {
      await notify(body, { dryRun });
      await repo.logNotification({
        notification_type: 'no_feeding_7days',
        target_date: today,
        target_animal_id: t.animal_id,
        message: body
      });
      results.push({ animal: t.animal_name, sent: true });
    } catch (e) {
      console.error('[notify:error]', e.message);
      await repo.logNotification({
        notification_type: 'no_feeding_7days',
        target_date: today,
        target_animal_id: t.animal_id,
        message: body,
        success: false
      });
      results.push({ animal: t.animal_name, sent: false, error: e.message });
    }
  }
  return results;
}

// =========================
// 2: 記入漏れ（18:00 想定）
// =========================
async function checkMissingRecords({ asOfDate = null, dryRun = false } = {}) {
  const today = asOfDate || new Date().toISOString().slice(0, 10);
  const check = await repo.findMissingRecord(today);
  if (!check.missing) return { missing: false };

  if (await repo.alreadyNotified({
    notification_type: 'missing_record',
    target_date: today
  })) {
    return { missing: true, alreadyNotified: true };
  }

  const body = `[info][title]📋 記入漏れアラート（${today}）[/title]本日の動物管理表に記入漏れがあります。
- ${check.reasons.join('\n- ')}

退店前にご確認ください。[/info]`;
  try {
    await notify(body, { dryRun });
    await repo.logNotification({
      notification_type: 'missing_record',
      target_date: today,
      message: body
    });
    return { missing: true, sent: true };
  } catch (e) {
    await repo.logNotification({
      notification_type: 'missing_record',
      target_date: today,
      message: body,
      success: false
    });
    return { missing: true, sent: false, error: e.message };
  }
}

// =========================
// 3: テスト送信
// =========================
async function sendTest({ dryRun = false } = {}) {
  const body = `[info][title]✅ Chatwork通知テスト[/title]レオパ管理アプリからの接続テストです。
このメッセージが届いていれば設定は正常です。[/info]`;
  return notify(body, { dryRun });
}

module.exports = { checkLongTermFoodAlerts, checkMissingRecords, sendTest, notify };
