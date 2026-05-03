#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const alerts = require('../lib/alerts');

(async () => {
  const dry = process.argv.includes('--dry');
  console.log('[test] Chatwork通知テスト' + (dry ? ' (dry-run)' : ''));
  try {
    const r = await alerts.sendTest({ dryRun: dry });
    console.log(JSON.stringify(r, null, 2));
  } catch (e) {
    console.error('エラー:', e.message);
    process.exit(1);
  }
})();
