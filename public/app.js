'use strict';

// ===== 共通ユーティリティ =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shiftDate(yyyy_mm_dd, days) {
  const d = new Date(yyyy_mm_dd);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function nowHhmm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function showToast(text, ms = 1800, kind = '') {
  const t = $('#toast');
  t.textContent = text;
  t.classList.remove('success', 'error');
  if (kind) t.classList.add(kind);
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), ms);
}
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

// ===== グローバル状態 =====
const state = {
  animals: [],
  foods: [],
  staff: [],
  current: null,   // 現在表示中の record
  formState: null  // フォーム上の編集中状態
};

// ===== マスタロード =====
async function loadMasters() {
  state.animals = await api('GET', '/api/animals');
  state.foods = await api('GET', '/api/foods');
  state.staff = await api('GET', '/api/staff');

  const sel = $('#staffId');
  sel.innerHTML = '<option value="">選択...</option>' +
    state.staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

  // 一括餌セレクト
  const bulk = $('#bulkFoodSelect');
  if (bulk) {
    bulk.innerHTML = '<option value="">餌の種類を選択...</option>' +
      state.foods.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
  }
}

// ===== 個体グリッド描画 =====
const POOP_OPTIONS = ['なし', '1', '2', '3', '4以上', '異常（要確認）'];

function renderAnimalGrid() {
  const grid = $('#animalGrid');
  grid.innerHTML = state.animals.map(a => animalCardHtml(a)).join('');

  // ドラッグ＆ドロップで並び替え（ハンドルだけドラッグ可能に。スマホで誤動作させない）
  if (window.Sortable) {
    Sortable.create(grid, {
      animation: 150,
      handle: '.card-drag-handle',
      ghostClass: 'dragging',
      delayOnTouchOnly: true,
      delay: 200, // タッチ200ms以上長押しでドラッグ開始（スクロールと両立）
      touchStartThreshold: 5,
      onEnd: async () => {
        const items = Array.from(grid.querySelectorAll('.animal-card'))
          .map((el, i) => ({ id: Number(el.dataset.id), display_order: i + 1 }));
        try {
          await api('POST', '/api/animals/reorder', { items });
          state.animals = await api('GET', '/api/animals');
          showToast('並び順を保存');
        } catch (e) {
          alert('並び替え保存エラー: ' + e.message);
        }
      }
    });
  }

  // イベントバインド
  $$('#animalGrid .animal-card').forEach(card => {
    // 給餌なしトグル
    const toggle = card.querySelector('.toggle-no-feeding');
    toggle.addEventListener('click', () => {
      const cur = toggle.classList.toggle('on');
      card.classList.toggle('no-feeding-state', cur);
      toggle.textContent = cur ? '給餌なし' : '給餌あり';
      // 「給餌あり」に切り替えた時、まだ何も選んでいなければ「イエコ」を自動選択
      if (!cur) {
        const anySelected = card.querySelector('.checkbox-pill.on');
        if (!anySelected) {
          const iekoPill = Array.from(card.querySelectorAll('.checkbox-pill'))
            .find(p => (p.textContent || '').trim() === 'イエコ');
          if (iekoPill) iekoPill.classList.add('on');
        }
      }
    });
    // 餌チェックボックス
    card.querySelectorAll('.checkbox-pill').forEach(pill => {
      pill.addEventListener('click', () => pill.classList.toggle('on'));
    });
  });

  // 体重欄
  const wg = $('#weightGrid');
  wg.innerHTML = state.animals.map(a => `
    <div>
      <label>${a.name}（前回: ${a.latest_weight ?? '-'} g）</label>
      <input type="number" step="0.01" data-weight-animal="${a.id}" placeholder="g">
    </div>
  `).join('');
}

function animalCardHtml(a) {
  const foodPills = state.foods.map(f =>
    `<span class="checkbox-pill" data-food-id="${f.id}">${f.name}</span>`
  ).join('');

  // 性別 → クラス
  const sex = (a.sex || 'U');
  const sexClass = a.category === 'sale'
    ? 'cat-sale'
    : (sex === 'M' ? 'sex-M' : sex === 'F' ? 'sex-F' : 'cat-sale');
  const sexBadge = sex === 'M' ? '♂' : sex === 'F' ? '♀' : '?';

  const photo = a.photo_url
    ? `<img class="photo" src="${a.photo_url}" alt="${a.name}" onerror="this.style.display='none'">`
    : '';

  const morph = a.morph
    ? `<div class="morph" title="${a.morph}">${a.morph}</div>`
    : '';

  // 体重減少アラート（前回体重より5%/10%以上落ちていたらバッジ表示）
  let weightAlert = '';
  if (a.latest_weight != null && a.previous_weight != null && a.previous_weight > 0) {
    const dropPct = ((a.previous_weight - a.latest_weight) / a.previous_weight) * 100;
    if (dropPct >= 10) {
      weightAlert = `<span class="weight-alert weight-alert-danger" title="前回 ${a.previous_weight}g → 今回 ${a.latest_weight}g（-${dropPct.toFixed(1)}%）">⚠️ 体重10%減</span>`;
    } else if (dropPct >= 5) {
      weightAlert = `<span class="weight-alert weight-alert-warn" title="前回 ${a.previous_weight}g → 今回 ${a.latest_weight}g（-${dropPct.toFixed(1)}%）">⚠️ 体重5%減</span>`;
    }
  }

  const poopOptions = POOP_OPTIONS.map(v =>
    `<option value="${v}">${v || '選択...'}</option>`
  ).join('');

  return `
  <div class="animal-card no-feeding-state ${sexClass}" data-id="${a.id}">
    <span class="card-drag-handle" title="長押しして並び替え">⋮⋮</span>
    <div class="head">
      ${photo}
      <div class="name-block">
        <div class="name">
          <span class="sex-badge">${sexBadge}</span>
          ${a.name}
          ${weightAlert}
        </div>
        ${morph}
      </div>
      <span class="weight">${a.latest_weight ? `${a.latest_weight}g` : ''}</span>
    </div>
    <span class="toggle toggle-no-feeding on">給餌なし</span>
    <div style="margin-top:8px">
      <label>餌（複数選択可）</label>
      <div class="checkbox-group food-pills">${foodPills}</div>
    </div>
    <div class="feed-row" style="margin-top:8px">
      <div style="flex:1">
        <label>量</label>
        <input type="text" class="amount-input" placeholder="例: 1, 2, 3">
      </div>
      <div style="flex:1">
        <label>糞</label>
        <select class="poop-input">${poopOptions}</select>
      </div>
    </div>
    <div style="margin-top:6px">
      <label>個体メモ</label>
      <input type="text" class="animal-notes" placeholder="任意">
    </div>
  </div>`;
}

// ===== レコード読み込み → フォームに反映 =====
async function loadRecord(date) {
  $('#recordDate').value = date;
  const rec = await api('GET', `/api/records/${date}`);
  state.current = rec;

  if (!rec) {
    $('#recordStatus').textContent = '未入力';
    $('#recordTime').value = nowHhmm();
    setStaffByName(null);
    $('#countStatus').value = '変動なし';
    $('#healthStatus').value = '良好';
    $('#cleaningStatus').value = '掃除済み';
    $('#notes').value = '';
    setToggle('cleaning', true);
    setToggle('disinfection', true);
    setToggle('maintenance', true);
    setToggle('shelter_wash', false);
    setToggle('is_full_maintenance', false);
    $$('#animalGrid .animal-card').forEach(c => {
      c.classList.add('no-feeding-state');
      c.querySelector('.toggle-no-feeding').classList.add('on');
      c.querySelector('.toggle-no-feeding').textContent = '給餌なし';
      c.querySelectorAll('.checkbox-pill.on').forEach(p => p.classList.remove('on'));
      c.querySelector('.amount-input').value = '';
      c.querySelector('.poop-input').value = 'なし';
      c.querySelector('.animal-notes').value = '';
    });
    return;
  }

  $('#recordStatus').innerHTML = `<span class="badge good">記入済み</span>　最終更新: ${rec.updated_at}`;
  $('#recordTime').value = rec.record_time || '';
  $('#staffId').value = rec.staff_id || '';
  $('#countStatus').value = rec.count_status || '変動なし';
  $('#healthStatus').value = rec.health_status || '良好';
  $('#cleaningStatus').value = rec.cleaning_status || '掃除済み';
  $('#notes').value = rec.notes || '';
  setToggle('cleaning', !!rec.cleaning);
  setToggle('disinfection', !!rec.disinfection);
  setToggle('maintenance', !!rec.maintenance);
  setToggle('shelter_wash', !!rec.shelter_wash);
  setToggle('is_full_maintenance', !!rec.is_full_maintenance);

  // 個体別
  const feedingsByAnimal = new Map();
  (rec.feedings || []).forEach(f => feedingsByAnimal.set(f.animal_id, f));

  $$('#animalGrid .animal-card').forEach(card => {
    const id = Number(card.dataset.id);
    const f = feedingsByAnimal.get(id);
    if (!f) {
      card.classList.add('no-feeding-state');
      card.querySelector('.toggle-no-feeding').classList.add('on');
      card.querySelector('.toggle-no-feeding').textContent = '給餌なし';
      card.querySelectorAll('.checkbox-pill.on').forEach(p => p.classList.remove('on'));
      card.querySelector('.amount-input').value = '';
      card.querySelector('.poop-input').value = 'なし';
      card.querySelector('.animal-notes').value = '';
      return;
    }
    const isNo = !!f.no_feeding;
    card.classList.toggle('no-feeding-state', isNo);
    card.querySelector('.toggle-no-feeding').classList.toggle('on', isNo);
    card.querySelector('.toggle-no-feeding').textContent = isNo ? '給餌なし' : '給餌あり';
    card.querySelector('.amount-input').value = f.amount || '';
    card.querySelector('.poop-input').value = f.poop || 'なし';
    card.querySelector('.animal-notes').value = f.notes || '';
    const foodIds = (f.foods || []).map(x => x.food_id);
    card.querySelectorAll('.checkbox-pill').forEach(pill => {
      pill.classList.toggle('on', foodIds.includes(Number(pill.dataset.foodId)));
    });
  });
}

function setStaffByName(name) {
  if (!name) { $('#staffId').value = ''; return; }
  const s = state.staff.find(x => x.name === name);
  if (s) $('#staffId').value = s.id;
}
function setToggle(key, on) {
  const t = document.querySelector(`.toggle[data-key="${key}"]`);
  if (!t) return;
  t.classList.toggle('on', !!on);
  if (key === 'is_full_maintenance') {
    $('#weightSection').style.display = on ? 'block' : 'none';
  }
}

// ===== フォーム → ペイロード =====
function buildPayload() {
  const date = $('#recordDate').value;
  const get = (k) => document.querySelector(`.toggle[data-key="${k}"]`).classList.contains('on');
  const feedings = $$('#animalGrid .animal-card').map(card => {
    const animal_id = Number(card.dataset.id);
    const noFeed = card.querySelector('.toggle-no-feeding').classList.contains('on');
    const food_ids = $$('.checkbox-pill.on', card).map(p => Number(p.dataset.foodId));
    return {
      animal_id,
      no_feeding: noFeed ? 1 : 0,
      food_ids: noFeed ? [] : food_ids,
      amount: card.querySelector('.amount-input').value || null,
      poop: card.querySelector('.poop-input').value || null,
      notes: card.querySelector('.animal-notes').value || null
    };
  });

  const weights = $$('#weightGrid input[data-weight-animal]')
    .filter(i => i.value)
    .map(i => ({ animal_id: Number(i.dataset.weightAnimal), weight_g: i.value }));

  return {
    record_date: date,
    record_time: $('#recordTime').value || null,
    cleaning: get('cleaning') ? 1 : 0,
    disinfection: get('disinfection') ? 1 : 0,
    maintenance: get('maintenance') ? 1 : 0,
    shelter_wash: get('shelter_wash') ? 1 : 0,
    count_status: $('#countStatus').value,
    health_status: $('#healthStatus').value,
    cleaning_status: $('#cleaningStatus').value,
    staff_id: Number($('#staffId').value) || null,
    notes: $('#notes').value || null,
    is_full_maintenance: get('is_full_maintenance') ? 1 : 0,
    feedings,
    weights
  };
}

// ===== ダッシュボード警告表示 =====
async function loadAlerts() {
  try {
    const dash = await api('GET', '/api/dashboard');
    const html = [];
    if (dash.longTerm && dash.longTerm.length) {
      const list = dash.longTerm.map(a =>
        `${a.animal_name}（${a.days_since_fed != null ? `${a.days_since_fed}日経過` : '記録なし'}）`
      ).join('、');
      html.push(`<div class="alert-banner">⚠️ 7日間給餌なしの個体: ${list}</div>`);
    }
    if (dash.missing && dash.missing.missing && dash.today === $('#recordDate').value) {
      html.push(`<div class="alert-banner warn">📋 本日の記入漏れ: ${dash.missing.reasons.join(' / ')}</div>`);
    }
    $('#alertArea').innerHTML = html.join('');
  } catch (e) { console.error(e); }
}

// ===== イベント結線 =====
function bindEvents() {
  $('#recordDate').addEventListener('change', () => loadRecord($('#recordDate').value));
  $('#prevDay').addEventListener('click', () => loadRecord(shiftDate($('#recordDate').value, -1)));
  $('#nextDay').addEventListener('click', () => loadRecord(shiftDate($('#recordDate').value, 1)));
  $('#today').addEventListener('click', () => loadRecord(todayStr()));
  $('#reload').addEventListener('click', () => loadRecord($('#recordDate').value));

  // トグル
  $$('.toggle[data-key]').forEach(t => {
    t.addEventListener('click', () => {
      const on = t.classList.toggle('on');
      if (t.dataset.key === 'is_full_maintenance') {
        $('#weightSection').style.display = on ? 'block' : 'none';
      }
    });
  });

  // 「すべて通常通り」
  $('#markAllNormal').addEventListener('click', () => {
    setToggle('cleaning', true); setToggle('disinfection', true); setToggle('maintenance', true);
    $('#countStatus').value = '変動なし';
    $('#healthStatus').value = '良好';
    $('#cleaningStatus').value = '掃除済み';
    if (!$('#recordTime').value) $('#recordTime').value = nowHhmm();
    showToast('共通項目を通常値に設定');
  });

  // 全個体「給餌なし」
  $('#markAllNoFeeding').addEventListener('click', () => {
    $$('#animalGrid .animal-card').forEach(card => {
      card.classList.add('no-feeding-state');
      card.querySelector('.toggle-no-feeding').classList.add('on');
      card.querySelector('.toggle-no-feeding').textContent = '給餌なし';
      card.querySelectorAll('.checkbox-pill.on').forEach(p => p.classList.remove('on'));
      card.querySelector('.amount-input').value = '';
    });
    showToast('全個体を「給餌なし」に設定');
  });

  // 全個体「給餌あり」（イエコをデフォルト選択）
  $('#markAllFed').addEventListener('click', () => {
    $$('#animalGrid .animal-card').forEach(card => {
      card.classList.remove('no-feeding-state');
      const tg = card.querySelector('.toggle-no-feeding');
      tg.classList.remove('on');
      tg.textContent = '給餌あり';
      // まだ何も選ばれていなければ「イエコ」を自動選択
      const anySelected = card.querySelector('.checkbox-pill.on');
      if (!anySelected) {
        const iekoPill = Array.from(card.querySelectorAll('.checkbox-pill'))
          .find(p => (p.textContent || '').trim() === 'イエコ');
        if (iekoPill) iekoPill.classList.add('on');
      }
    });
    showToast('全個体を「給餌あり」に設定（デフォルト：イエコ）');
  });

  // 餌の種類を一括適用
  $('#applyBulkFood').addEventListener('click', () => {
    const foodId = $('#bulkFoodSelect').value;
    if (!foodId) { showToast('餌の種類を選択してください'); return; }
    $$('#animalGrid .animal-card').forEach(card => {
      // 給餌ありに切替
      card.classList.remove('no-feeding-state');
      const tg = card.querySelector('.toggle-no-feeding');
      tg.classList.remove('on');
      tg.textContent = '給餌あり';
      // 該当餌だけ ON にする
      card.querySelectorAll('.checkbox-pill').forEach(pill => {
        pill.classList.toggle('on', pill.dataset.foodId === foodId);
      });
    });
    const foodName = state.foods.find(f => String(f.id) === String(foodId))?.name || '';
    showToast(`全個体に「${foodName}」を適用`);
  });

  // 糞なし（一括）
  $('#markAllNoPoop').addEventListener('click', () => {
    $$('#animalGrid .animal-card').forEach(card => {
      card.querySelector('.poop-input').value = 'なし';
    });
    showToast('全個体の糞を「なし」に設定（個別に変更可）');
  });

  // 前日コピー
  $('#copyPrev').addEventListener('click', async () => {
    const date = $('#recordDate').value;
    const prev = await api('GET', `/api/records/previous-of/${date}`);
    if (!prev) { showToast('コピー元のデータがありません'); return; }
    if (!confirm(`${prev.record_date} の内容をコピーしますか？\n（保存はまだされません）`)) return;
    // record_date を上書きして反映用に流用
    state.current = prev;
    await applyToFormFromRecord(prev);
    showToast(`${prev.record_date} の内容をコピーしました`);
  });

  $('#save').addEventListener('click', async () => {
    const saveBtn = $('#save');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    try {
      const payload = buildPayload();
      await api('POST', '/api/records', payload);
      showToast('✅ 保存されました', 2200, 'success');
      await loadRecord(payload.record_date);
      await loadAlerts();
    } catch (e) {
      console.error(e);
      showToast('❌ 保存失敗: ' + e.message, 3000, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  });
}

async function applyToFormFromRecord(rec) {
  // 共通項目
  $('#recordTime').value = rec.record_time || nowHhmm();
  $('#staffId').value = rec.staff_id || '';
  $('#countStatus').value = rec.count_status || '変動なし';
  $('#healthStatus').value = rec.health_status || '良好';
  $('#cleaningStatus').value = rec.cleaning_status || '掃除済み';
  $('#notes').value = rec.notes || '';
  setToggle('cleaning', !!rec.cleaning);
  setToggle('disinfection', !!rec.disinfection);
  setToggle('maintenance', !!rec.maintenance);
  setToggle('shelter_wash', false); // シェルター洗いは引き継がない
  setToggle('is_full_maintenance', false); // フルメンテは引き継がない

  const feedingsByAnimal = new Map();
  (rec.feedings || []).forEach(f => feedingsByAnimal.set(f.animal_id, f));
  $$('#animalGrid .animal-card').forEach(card => {
    const id = Number(card.dataset.id);
    const f = feedingsByAnimal.get(id);
    if (!f) return;
    const isNo = !!f.no_feeding;
    card.classList.toggle('no-feeding-state', isNo);
    card.querySelector('.toggle-no-feeding').classList.toggle('on', isNo);
    card.querySelector('.toggle-no-feeding').textContent = isNo ? '給餌なし' : '給餌あり';
    card.querySelector('.amount-input').value = f.amount || '';
    card.querySelector('.poop-input').value = f.poop || 'なし';
    card.querySelector('.animal-notes').value = f.notes || '';
    const foodIds = (f.foods || []).map(x => x.food_id);
    card.querySelectorAll('.checkbox-pill').forEach(pill => {
      pill.classList.toggle('on', foodIds.includes(Number(pill.dataset.foodId)));
    });
  });
}

// ===== 起動 =====
(async function main() {
  await loadMasters();
  renderAnimalGrid();
  bindEvents();
  // URL パラメータ ?date=YYYY-MM-DD があればそれを開く
  const params = new URLSearchParams(location.search);
  const initialDate = params.get('date') || todayStr();
  await loadRecord(initialDate);
  await loadAlerts();
})();
