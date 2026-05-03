'use strict';

// Chatwork API クライアント（メッセージ送信のみ）
const https = require('https');

function sendMessage({ token, roomId, body, mentionIds = [] }) {
  return new Promise((resolve, reject) => {
    if (!token || !roomId) {
      return reject(new Error('CHATWORK_API_TOKEN / CHATWORK_ROOM_ID が未設定です'));
    }

    let messageBody = body;
    if (mentionIds && mentionIds.length) {
      const tos = mentionIds.map(id => `[To:${id}]`).join('');
      messageBody = `${tos}\n${body}`;
    } else {
      messageBody = `[toall]\n${body}`;
    }

    const data = `body=${encodeURIComponent(messageBody)}&self_unread=0`;
    const opts = {
      hostname: 'api.chatwork.com',
      path: `/v2/rooms/${roomId}/messages`,
      method: 'POST',
      headers: {
        'X-ChatWorkToken': token,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(opts, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(chunks)); } catch (_) { resolve({ raw: chunks }); }
        } else {
          reject(new Error(`Chatwork API ${res.statusCode}: ${chunks}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

module.exports = { sendMessage };
