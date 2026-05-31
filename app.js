// Регистрируем service worker (sw.js) — кэширует приложение для офлайн-работы.
// В продакшене (например, GitHub Pages) включаем SW, а в локальной разработке
// (localhost) — наоборот, снимаем регистрацию, чтобы кэш не мешал отладке.
if ('serviceWorker' in navigator) {
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (isLocal) {
    navigator.serviceWorker.getRegistrations()
      .then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}



// ══════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════
const ALL_EMO = ['🏠','🚗','🍕','☕','🛍️','💊','🎬','✈️','📚','🎮','💪','🐾','🎵','👗','🍺','🍔','🛒','💼','💻','📱','⚽','🎓','🏖️','🎁','💅','🧴','⚡','🌿','🎨','🔧','🎭','🏋️','🍣','🥗','🎪','🎯','🏦','🚂','🎸','🍜'];
const GOAL_EMO = ['🎯','✈️','🏠','🚗','💍','🎓','💻','📱','🏖️','🎸','💰','🛳️','🏔️','🌍','🏡','⛵'];
const COLORS = ['#E8304A','#FF6B35','#F0900A','#00B876','#2B6FED','#8B5CF6','#EC4899','#14B8A6','#6366F1','#D97706','#64748B','#10B981'];
const FREQ = {monthly:'Ежемесячно',weekly:'Еженедельно',yearly:'Ежегодно',quarterly:'Ежеквартально',daily:'Ежедневно'};
const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
const DAYS = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
const DEF_CATS = [
  {id:'food',name:'Еда',icon:'🍕',color:'#FF6B35',type:'expense'},
  {id:'coffee',name:'Кофе',icon:'☕',color:'#F0900A',type:'expense'},
  {id:'transport',name:'Транспорт',icon:'🚗',color:'#2B6FED',type:'expense'},
  {id:'shopping',name:'Покупки',icon:'🛍️',color:'#EC4899',type:'expense'},
  {id:'health',name:'Здоровье',icon:'💊',color:'#00B876',type:'expense'},
  {id:'housing',name:'Жильё',icon:'🏠',color:'#8B5CF6',type:'expense'},
  {id:'entertain',name:'Развлечения',icon:'🎬',color:'#E8304A',type:'expense'},
  {id:'sport',name:'Спорт',icon:'💪',color:'#14B8A6',type:'expense'},
  {id:'travel',name:'Путешествия',icon:'✈️',color:'#6366F1',type:'expense'},
  {id:'pets',name:'Питомцы',icon:'🐾',color:'#D97706',type:'expense'},
  {id:'salary',name:'Зарплата',icon:'💼',color:'#00B876',type:'income'},
  {id:'freelance',name:'Фриланс',icon:'💻',color:'#2B6FED',type:'income'},
  {id:'invest',name:'Инвестиции',icon:'📈',color:'#8B5CF6',type:'income'},
  {id:'gift',name:'Подарки',icon:'🎁',color:'#F0900A',type:'income'},
  {id:'other',name:'Другое',icon:'📦',color:'#64748B',type:'both'},
];
// ══════════════════════════════════════
// PERSISTENT STORAGE — IndexedDB + localStorage
// IndexedDB не очищается при "Очистить историю" в Safari
// localStorage — быстрый fallback
// ══════════════════════════════════════
const KEY = 'vault_v6';
const IDB_NAME = 'VaultDB';
const IDB_STORE = 'state';
const IDB_KEY = 'main';

let idb = null;

function openIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = e => { idb = e.target.result; res(idb); };
    req.onerror = () => rej(req.error);
  });
}

function saveToIDB(data) {
  if (!idb) return;
  try {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(data, IDB_KEY);
  } catch(e) {}
}

function loadFromIDB() {
  return new Promise((res) => {
    if (!idb) return res(null);
    try {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
    } catch(e) { res(null); }
  });
}

function save() {
  // Если облако настроено — БД по аккаунту единственный источник правды,
  // локально ничего не храним. Иначе (дев без облака) пишем в localStorage/IDB.
  if (window.cloudEnabled) {
    if (window.cloudPushDebounced) window.cloudPushDebounced(S);
    return;
  }
  const data = JSON.stringify(S);
  localStorage.setItem(KEY, data);
  saveToIDB(data); // дублируем в IndexedDB
}

function parseState(raw) {
  if (!raw) return null;
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      profile: { name: 'Денис', email: 'denis@example.com', ...(p.profile || {}) },
      accounts: { cash: p.accounts?.cash ?? 0, bank: p.accounts?.bank ?? 0 },
      transactions: p.transactions || [],
      categories: p.categories || JSON.parse(JSON.stringify(DEF_CATS)),
      goals: p.goals || [],
      recurring: p.recurring || [],
      templates: p.templates || [],
      settings: p.settings || {},
      notifs: p.notifs || [],
      debts: p.debts || [],
      piggy: { balance: 0, history: [], pin: null, ...(p.piggy || {}) },
      createdAt: p.createdAt || new Date().toISOString(),
    };
  } catch(e) { return null; }
}

function loadS() {
  // Сначала пробуем localStorage (быстро)
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = parseState(raw);
      if (parsed && parsed.transactions.length >= 0) return parsed;
    }
  } catch(e) {}
  return parseState(null) || getDefaultState();
}

function getDefaultState() {
  return {
    profile: { name: 'Денис', email: 'denis@example.com' },
    accounts: { cash: 0, bank: 0 },
    transactions: [], categories: JSON.parse(JSON.stringify(DEF_CATS)),
    goals: [], recurring: [], templates: [],
    settings: {}, notifs: [],
    debts: [],
    piggy: { balance: 0, history: [], pin: null },
    createdAt: new Date().toISOString(),
  };
}

// Загружаем состояние сразу — S доступен всем функциям ниже
let S = loadS();

// ══════════════════════════════════════
// UTILS
// ══════════════════════════════════════
const fmt = n => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const getCat = id => S.categories.find(c => c.id === id) || { name: 'Другое', icon: '📦', color: '#64748B' };
const acctLabel = a => a === 'cash' ? '💵 Наличные' : a === 'bank' ? '🏦 Банковский счёт' : a === 'piggy' ? '🐷 Копилка' : '—';
// Экранирование пользовательского текста перед вставкой через innerHTML.
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Разбор даты 'YYYY-MM-DD' в локальные числа (без UTC-сдвига, как в dateLabel).
const ymd = s => { const p = String(s).split('-'); return { y: +p[0], m: +p[1] - 1, d: +p[2] }; };

function dateLabel(d) {
  // Parse YYYY-MM-DD without timezone shift
  const parts = d.split('-');
  const txDate = new Date(+parts[0], +parts[1]-1, +parts[2]);
  const todayDate = new Date(); todayDate.setHours(0,0,0,0);
  const diff = Math.round((todayDate - txDate) / 86400000);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  if (diff === -1) return 'Завтра';
  return txDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Доброй ночи,';
  if (h < 12) return 'Доброе утро,';
  if (h < 17) return 'Добрый день,';
  return 'Добрый вечер,';
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2500);
}

// Тост с кнопкой «Отменить» — для обратимых удалений.
let _undoTimer = null;
function undoToast(message, restoreFn) {
  const old = document.getElementById('undo-toast');
  if (old) old.remove();
  clearTimeout(_undoTimer);
  const el = document.createElement('div');
  el.id = 'undo-toast';
  el.className = 'undo-toast';
  el.innerHTML = `<span>${esc(message)}</span><button type="button">Отменить</button>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 250); };
  _undoTimer = setTimeout(close, 5000);
  el.querySelector('button').addEventListener('click', () => { clearTimeout(_undoTimer); close(); restoreFn(); });
}

function openM(id) { document.getElementById(id).classList.add('on'); }
function closeM(id) { document.getElementById(id).classList.remove('on'); }

// Универсальный диалог подтверждения (нижний лист)
function confirmSheet({ title, text = '', okText = 'Удалить', danger = true, onOk }) {
  const ov = document.createElement('div');
  ov.className = 'cdlg-ov';
  ov.innerHTML = `<div class="cdlg">
    <div class="cdlg-t">${title}</div>
    ${text ? `<div class="cdlg-s">${text}</div>` : ''}
    <div class="cdlg-btns">
      <button class="cdlg-cancel" type="button">Отмена</button>
      <button class="cdlg-ok${danger ? ' danger' : ''}" type="button">${okText}</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  ov.querySelector('.cdlg-cancel').addEventListener('click', close);
  ov.querySelector('.cdlg-ok').addEventListener('click', () => { close(); if (onOk) onOk(); });
  return ov;
}

// Универсальный нижний лист с произвольным содержимым (для форм-попапов).
// Единый стиль с модалками: скруглённый лист, крестик закрытия, без «ручки».
function openSheet(innerHTML) {
  const ov = document.createElement('div');
  ov.className = 'cdlg-ov';
  ov.innerHTML = `<div class="cdlg" style="position:relative">
    <button class="m-close" type="button" aria-label="Закрыть">&times;</button>
    ${innerHTML}
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  ov.querySelector('.m-close').addEventListener('click', close);
  return { ov, close };
}

// Close modal on overlay tap
['m-add','m-det','m-edit-tx','m-tuse','m-tadd','m-cadd','m-cedit','m-prof','m-gadd','m-gdet','m-radd','m-acct','m-piggy'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => { if (e.target === document.getElementById(id)) closeM(id); });
});

// Убираем «ручку» (потянуть вниз) и ставим явную кнопку × в каждом окне
function setupModalCloses() {
  document.querySelectorAll('.ovl > .mdl').forEach(mdl => {
    mdl.querySelector('.mhdl')?.remove();
    if (!mdl.querySelector('.m-close')) {
      const btn = document.createElement('button');
      btn.className = 'm-close';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Закрыть');
      btn.innerHTML = '&times;';
      btn.addEventListener('click', () => mdl.closest('.ovl')?.classList.remove('on'));
      mdl.prepend(btn);
    }
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupModalCloses);
else setupModalCloses();

// emoji picker
// ── EMOJI PICKER ──────────────────────
function buildEmoji(elId, list = ALL_EMO, selected = null) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = list.map(e =>
    `<div class="egc${selected === e ? ' on' : ''}" data-e="${e}">${e}</div>`
  ).join('');
  if (!selected) el.querySelector('.egc')?.classList.add('on');
  el.querySelectorAll('.egc').forEach(c => c.addEventListener('click', () => {
    el.querySelectorAll('.egc').forEach(x => x.classList.remove('on'));
    c.classList.add('on');
  }));
}
function getEmoji(elId) {
  return document.querySelector(`#${elId} .egc.on`)?.dataset.e || '📦';
}

// ── AVATAR PICKER (только своё фото; иначе буква имени) ──
const isImgAvatar = v => typeof v === 'string' && v.startsWith('data:');
function buildAvatarPicker(elId, selected = '') {
  const el = document.getElementById(elId);
  if (!el) return;
  const nm = (S.profile && S.profile.name) ? S.profile.name.trim() : '';
  const letter = (nm && nm !== 'Денис' ? nm[0] : 'А').toUpperCase();
  const img = isImgAvatar(selected);
  // Текущее фото храним прямо на элементе, чтобы getAvatar его достал.
  el._imgData = img ? selected : null;
  el.classList.add('av-picker');
  el.innerHTML = `
    <div class="avp-prev${img ? ' has-img' : ''}"${img ? ` style="background-image:url('${selected}')"` : ''}>${img ? '' : letter}</div>
    <div class="avp-actions">
      <button type="button" class="avp-btn" data-act="upload">${img ? 'Изменить фото' : 'Загрузить фото'}</button>
      ${img ? '<button type="button" class="avp-btn avp-rm" data-act="remove">Убрать</button>' : ''}
    </div>`;
  el.querySelector('[data-act="upload"]')?.addEventListener('click', () => triggerAvatarUpload(elId));
  el.querySelector('[data-act="remove"]')?.addEventListener('click', () => { el._imgData = null; buildAvatarPicker(elId, ''); });
}
function getAvatar(elId) {
  const el = document.getElementById(elId);
  return el?._imgData || '';
}

// Загрузка и сжатие фото-аватара (квадрат 256px, JPEG) → data-URL
function triggerAvatarUpload(elId) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.addEventListener('change', () => {
    const file = inp.files && inp.files[0];
    inp.remove();
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Нужен файл-изображение'); return; }
    fileToAvatarDataURL(file).then(dataUrl => {
      const el = document.getElementById(elId);
      if (!el) return;
      el._imgData = dataUrl;
      buildAvatarPicker(elId, dataUrl); // перерисуем превью + кнопки
    }).catch(() => toast('Не удалось обработать фото'));
  });
  inp.click();
}
function fileToAvatarDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => {
      const im = new Image();
      im.onerror = rej;
      im.onload = () => {
        const size = 256;
        const cv = document.createElement('canvas');
        cv.width = size; cv.height = size;
        const ctx = cv.getContext('2d');
        // cover-обрезка по центру
        const scale = Math.max(size / im.width, size / im.height);
        const w = im.width * scale, h = im.height * scale;
        ctx.drawImage(im, (size - w) / 2, (size - h) / 2, w, h);
        res(cv.toDataURL('image/jpeg', 0.85));
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

// ── COLOR PICKER ──────────────────────
function buildColor(elId, selected = null) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = COLORS.map(c =>
    `<div class="clr${selected === c ? ' on' : ''}" data-c="${c}" style="background:${c}"></div>`
  ).join('');
  if (!selected) el.querySelector('.clr')?.classList.add('on');
  el.querySelectorAll('.clr').forEach(d => d.addEventListener('click', () => {
    el.querySelectorAll('.clr').forEach(x => x.classList.remove('on'));
    d.classList.add('on');
  }));
}
function getColor(elId) {
  return document.querySelector(`#${elId} .clr.on`)?.dataset.c || '#64748B';
}

// ── CAT PICKER ────────────────────────
function buildCatPicker(elId, type, selected = null) {
  const el = document.getElementById(elId);
  if (!el) return;
  const cats = S.categories.filter(c => c.type === type || c.type === 'both');
  el.innerHTML = cats.map(c =>
    `<div class="cpill${selected === c.id ? ' on' : ''}" data-id="${c.id}">${c.icon} ${c.name}</div>`
  ).join('');
  if (!selected) el.querySelector('.cpill')?.classList.add('on');
  el.querySelectorAll('.cpill').forEach(p => p.addEventListener('click', () => {
    el.querySelectorAll('.cpill').forEach(x => x.classList.remove('on'));
    p.classList.add('on');
  }));
}
function getPickedCat(elId) {
  return document.querySelector(`#${elId} .cpill.on`)?.dataset.id || 'other';
}

// ── ACCOUNT PICKER ────────────────────
function buildAcctPicker(elId, dataAttr, selected = 'cash') {
  // Клонируем кнопки чтобы убрать старые listeners
  document.querySelectorAll(`#${elId} [data-${dataAttr}]`).forEach(b => {
    const nb = b.cloneNode(true);
    nb.classList.toggle('on', nb.dataset[dataAttr] === selected);
    b.parentNode.replaceChild(nb, b);
  });
  document.querySelectorAll(`#${elId} [data-${dataAttr}]`).forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll(`#${elId} [data-${dataAttr}]`).forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });
  });
}
function getAcctPicker(elId, dataAttr) {
  return document.querySelector(`#${elId} [data-${dataAttr}].on`)?.dataset[dataAttr] || 'cash';
}

// acct balances
function acctBal(acct) {
  return (S.accounts[acct] || 0) + S.transactions.reduce((s, t) => {
    if (t.account === acct) {
      if (t.type === 'income') return s + t.amount;
      if (t.type === 'expense') return s - t.amount;
      if (t.type === 'transfer') return s - t.amount;
    }
    if (t.type === 'transfer' && t.toAcct === acct) return s + t.amount;
    return s;
  }, 0);
}

function getMonthTxs() {
  const n = new Date();
  return S.transactions.filter(t => { const d = ymd(t.date); return d.m === n.getMonth() && d.y === n.getFullYear(); });
}

// ══════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════
let curSc = 'home';
const RENDER = { home: renderHome, transactions: renderTx, stats: renderStats, categories: renderCats, goals: renderGoals, recurring: renderRec, templates: renderTemplates, debts: renderDebts, profile: renderProfile };

function nav(name) {
  if (!document.getElementById('sc-' + name)) return;
  document.querySelectorAll('.sc').forEach(s => s.classList.remove('on'));
  document.getElementById('sc-' + name).classList.add('on');
  document.querySelectorAll('.nb[data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === name));
  curSc = name;
  RENDER[name]?.();
}
document.querySelectorAll('.nb[data-s]').forEach(b => b.addEventListener('click', () => nav(b.dataset.s)));
document.getElementById('open-add').addEventListener('click', () => openAddM('expense'));

// ══════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════
function addNotif(title, sub, icon = '🔔', type = 'info') {
  S.notifs.unshift({ id: uid(), title, sub, icon, type, time: new Date().toISOString(), read: false });
  if (S.notifs.length > 50) S.notifs = S.notifs.slice(0, 50);
  save(); updateNDot();
}

function updateNDot() {
  document.getElementById('ndot').style.display = S.notifs.some(n => !n.read) ? '' : 'none';
}

function openNP() { renderNP(); document.getElementById('notif-panel').classList.add('on'); }
function closeNP() { document.getElementById('notif-panel').classList.remove('on'); }

function renderNP() {
  const body = document.getElementById('np-body');
  if (!S.notifs.length) {
    body.innerHTML = '<div class="np-empty"><span class="ei">🔔</span><p>Уведомлений пока нет.<br>Они появятся автоматически.</p></div>';
    return;
  }
  const unread = S.notifs.filter(n => !n.read).length;
  body.innerHTML = `
    ${unread > 0 ? `<div class="np-mark" onclick="markAllRead()">Отметить все прочитанными (${unread})</div>` : ''}
    ${S.notifs.map(n => `
      <div class="ni ${n.read ? '' : 'unread'}" data-nid="${n.id}">
        <div class="ni-ic" style="background:${{ info: 'rgba(43,111,237,.15)', success: 'rgba(0,184,118,.15)', warn: 'rgba(240,144,10,.15)', error: 'rgba(232,48,74,.15)' }[n.type] || 'rgba(100,116,139,.15)'}">${n.icon}</div>
        <div class="ni-b">
          <div class="ni-t">${esc(n.title)}</div>
          <div class="ni-s">${esc(n.sub)}</div>
          <div class="ni-ts">${timeAgo(n.time)}</div>
        </div>
      </div>`).join('')}`;
  body.querySelectorAll('.ni').forEach(el => el.addEventListener('click', () => {
    const n = S.notifs.find(x => x.id === el.dataset.nid);
    if (n && !n.read) { n.read = true; save(); el.classList.remove('unread'); updateNDot(); }
  }));
}

function markAllRead() { S.notifs.forEach(n => n.read = true); save(); updateNDot(); renderNP(); }

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return Math.floor(s / 60) + ' мин. назад';
  if (s < 86400) return Math.floor(s / 3600) + ' ч. назад';
  return Math.floor(s / 86400) + ' дн. назад';
}

document.getElementById('notif-btn').addEventListener('click', openNP);

function autoNotifs() {
  const now = new Date();
  let changed = false;
  S.recurring.forEach(r => {
    const day = r.day || 1;
    let nd = new Date(now.getFullYear(), now.getMonth(), day);
    if (nd <= now) nd = new Date(now.getFullYear(), now.getMonth() + 1, day);
    const dl = Math.ceil((nd - now) / 86400000);
    if (dl <= 3) {
      const key = 'rc_' + r.id + '_' + nd.getMonth();
      if (!S.notifs.find(n => n.id === key)) {
        S.notifs.unshift({ id: key, title: 'Платёж через ' + dl + ' дн.', sub: r.name + ' — ' + fmt(r.amount) + ' €', icon: r.icon || '💳', type: 'warn', time: now.toISOString(), read: false });
        changed = true;
      }
    }
  });
  S.goals.forEach(g => {
    const pct = g.current / g.target * 100;
    [50, 75, 100].forEach(m => {
      const key = 'gl_' + g.id + '_' + m;
      if (pct >= m && !S.notifs.find(n => n.id === key)) {
        S.notifs.unshift({ id: key, title: m === 100 ? '🎉 Цель достигнута!' : 'Цель ' + m + '%', sub: `«${g.name}» — ${m === 100 ? 'поздравляем!' : 'продолжай!'}`, icon: g.icon || '🎯', type: m === 100 ? 'success' : 'info', time: now.toISOString(), read: false });
        changed = true;
      }
    });
  });
  // Превышение месячного бюджета категории (раз в месяц на категорию).
  const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const mTxs = getMonthTxs();
  S.categories.forEach(c => {
    if (!(c.budget > 0) || c.type === 'income') return;
    const spent = mTxs.filter(t => t.category === c.id && t.type === 'expense').reduce((a, t) => a + t.amount, 0);
    if (spent > c.budget) {
      const key = 'bg_' + c.id + '_' + ym;
      if (!S.notifs.find(n => n.id === key)) {
        S.notifs.unshift({ id: key, title: 'Бюджет превышен', sub: `${c.icon} ${c.name}: ${fmt(spent)} из ${fmt(c.budget)} €`, icon: '⚠️', type: 'warn', time: now.toISOString(), read: false });
        changed = true;
      }
    }
  });
  if (S.notifs.length > 50) { S.notifs = S.notifs.slice(0, 50); changed = true; }
  if (changed) save();
  updateNDot();
}

// ══════════════════════════════════════
// HOME
// ══════════════════════════════════════
function renderHome() {
  const n = (S.profile.name || 'A').split(' ')[0];
  document.getElementById('h-greet').textContent = greeting();
  document.getElementById('h-name').textContent = n;
  const hav = document.getElementById('h-av');
  if (hav) {
    if (isImgAvatar(S.profile.avatar)) {
      hav.classList.add('has-img');
      hav.style.backgroundImage = `url('${S.profile.avatar}')`;
      hav.textContent = '';
    } else {
      hav.classList.remove('has-img');
      hav.style.backgroundImage = '';
      hav.textContent = (S.profile.name || 'A')[0].toUpperCase();
    }
  }
  document.getElementById('h-date').textContent = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  // На главной показываем суммы за ТЕКУЩИЙ МЕСЯЦ (а не за всю историю —
  // так было запутанно). Общий баланс — это деньги на счетах прямо сейчас.
  const monthTxs = getMonthTxs();
  const inc = monthTxs.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const exp = monthTxs.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const cash = acctBal('cash'), bank = acctBal('bank');

  // Копилка — это спрятанные деньги: они списаны с банка и НЕ входят
  // в общий баланс и статистику. Поэтому считаем только наличные + банк.
  document.getElementById('h-bal').textContent = fmt(cash + bank) + ' €';
  document.getElementById('h-inc').textContent = fmt(inc) + ' €';
  document.getElementById('h-exp').textContent = fmt(exp) + ' €';
  document.getElementById('h-cash').textContent = fmt(cash) + ' €';
  document.getElementById('h-bank').textContent = fmt(bank) + ' €';

  autoNotifs();

  // QA
  const qas = [
    { i: '🎯', bg: 'rgba(99,102,241,.15)', l: 'Цели', fn: () => nav('goals') },
    { i: '🔁', bg: 'rgba(139,92,246,.15)', l: 'Платежи', fn: () => nav('recurring') },
    { i: '🤝', bg: 'rgba(240,144,10,.15)', l: 'Долги', fn: () => nav('debts') },
    { i: '🏷️', bg: 'rgba(20,184,166,.15)', l: 'Категории', fn: () => nav('categories') },
    { i: '⚡', bg: 'rgba(240,144,10,.15)', l: 'Шаблоны', fn: () => nav('templates') },
  ];
  const qaEl = document.getElementById('h-qa');
  qaEl.innerHTML = qas.map((q, i) => `<div class="qa-i" data-qi="${i}"><div class="qa-ic" style="background:${q.bg}">${q.i}</div><div class="qa-l">${q.l}</div></div>`).join('');
  qaEl.querySelectorAll('.qa-i').forEach((el, i) => el.addEventListener('click', qas[i].fn));

  // Insights: используем уже посчитанные за месяц значения inc/exp,
  // не дублируем баланс счетов (он уже виден в карточках выше).
  const dom = new Date().getDate();
  const avgDay = dom > 0 && exp > 0 ? exp / dom : 0;
  const lmDate = new Date(); lmDate.setDate(1); lmDate.setMonth(lmDate.getMonth() - 1);
  const lmExp = S.transactions.filter(t => { const d = ymd(t.date); return d.m === lmDate.getMonth() && d.y === lmDate.getFullYear() && t.type === 'expense'; }).reduce((a, t) => a + t.amount, 0);
  const diff = lmExp > 0 ? (exp - lmExp) / lmExp * 100 : null;
  const sr = inc > 0 ? Math.round((inc - exp) / inc * 100) : 0;
  const net = inc - exp;
  const insList = [
    { i: '📅', l: 'Ср. в день', v: fmt(avgDay) + ' €', tr: null },
    { i: '💹', l: 'Норма сбережений', v: sr + '%', tr: sr > 20 ? { cls: 'up', t: 'Отлично' } : sr > 0 ? { cls: 'neu', t: 'Норма' } : inc > 0 ? { cls: 'dn', t: 'В минус' } : null },
    { i: net >= 0 ? '💰' : '⚠️', l: 'Баланс месяца', v: (net >= 0 ? '+' : '') + fmt(net) + ' €', tr: null },
    { i: '📉', l: 'Расход за месяц', v: fmt(exp) + ' €', tr: diff !== null ? { cls: diff > 0 ? 'dn' : 'up', t: (diff > 0 ? '+' : '') + Math.round(diff) + '%' } : null },
  ];
  document.getElementById('h-ins').innerHTML = insList.map(it => `<div class="in-c"><div class="in-ico">${it.i}</div><div class="in-lbl">${it.l}</div><div class="in-val">${it.v}</div>${it.tr ? `<div class="tr ${it.tr.cls}">${it.tr.t}</div>` : ''}</div>`).join('');

  // Upcoming payments
  const now = new Date();
  const upcoming = S.recurring.map(r => {
    const day = r.day || 1;
    let nd = new Date(now.getFullYear(), now.getMonth(), day);
    if (nd <= now) nd = new Date(now.getFullYear(), now.getMonth() + 1, day);
    return { ...r, nd, dl: Math.ceil((nd - now) / 86400000) };
  }).filter(r => r.dl <= 7).sort((a, b) => a.dl - b.dl).slice(0, 3);

  const ucRow = document.getElementById('h-uc-row');
  const ucList = document.getElementById('h-upc');
  if (upcoming.length) {
    ucRow.style.display = '';
    ucList.innerHTML = upcoming.map(r => `<div class="upc"><div class="upc-ic" style="background:${getCat(r.category || 'other').color}18">${r.icon || getCat(r.category || 'other').icon}</div><div class="upc-b"><div class="upc-n">${esc(r.name)}</div><div class="upc-s">Через ${r.dl} дн. · ${r.nd.getDate()} ${MONTHS[r.nd.getMonth()]}</div></div><div class="upc-a">−${fmt(r.amount)} €</div></div>`).join('');
  } else { ucRow.style.display = 'none'; ucList.innerHTML = ''; }

  // Recent
  const recent = [...S.transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 7);
  const list = document.getElementById('h-txl');
  if (!recent.length) {
    list.innerHTML = '<div class="empty" style="margin:0 22px"><span class="ei">💳</span><p>Нет операций.<br>Нажми <strong>+</strong> чтобы добавить.</p></div>';
  } else {
    list.innerHTML = recent.map(txHTML).join('');
    list.querySelectorAll('.tx').forEach(el => el.addEventListener('click', () => openDet(el.dataset.id)));
  }
}

// ══════════════════════════════════════
// TX HTML
// ══════════════════════════════════════
function highlight(text, q) {
  if (!q || !text) return text || '';
  try {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark style="background:rgba(240,144,10,.3);border-radius:3px;padding:0 1px">$1</mark>');
  } catch(e) { return text; }
}

function txHTML(t) {
  const cat = getCat(t.category);
  const isInc = t.type === 'income', isTra = t.type === 'transfer';
  const q = txQ || '';
  return `<div class="tx" data-id="${t.id}">
    <div class="tx-ic" style="background:${cat.color}18">${isTra ? '🏧' : cat.icon}</div>
    <div class="tx-b">
      <div class="tx-n">${highlight(esc(t.desc || cat.name), q)}</div>
      <div class="tx-m">
        <span class="tx-c">${highlight(esc(isTra ? 'Банкомат' : cat.name), q)}</span>
        <span class="tx-d">· ${dateLabel(t.date)}</span>
        ${isTra ? `<span class="tx-d">· ${t.account==='cash'?'💵':'🏦'}→${t.toAcct==='cash'?'💵':'🏦'}</span>` : `<span class="tx-d">${t.account === 'cash' ? '· 💵' : '· 🏦'}</span>`}
        ${t.isRec ? '<span class="pill rec" style="padding:2px 6px;font-size:9px">🔁</span>' : ''}
      </div>
    </div>
    <div class="tx-r">
      <div class="tx-a ${isTra ? '' : isInc ? 'inc' : 'exp'}">${isTra ? '⇄ ' : isInc ? '+' : '−'}${fmt(t.amount)} €</div>
      ${t.note ? `<div class="tx-nt">${highlight(esc(t.note.slice(0, 20)), q)}${t.note.length > 20 ? '…' : ''}</div>` : ''}
    </div>
  </div>`;
}

// ══════════════════════════════════════
// TX DETAIL
// ══════════════════════════════════════
function openDet(id) {
  const t = S.transactions.find(x => x.id === id);
  if (!t) return;
  const cat = getCat(t.category);
  const isInc = t.type === 'income', isTra = t.type === 'transfer';
  const color = isTra ? 'var(--bl)' : isInc ? 'var(--gr)' : 'var(--rd)';
  document.getElementById('det-body').innerHTML = `
    <div class="det-ico">${isTra ? '🏧' : cat.icon}</div>
    <div class="det-amt" style="color:${color}">${isTra ? '' : isInc ? '+' : '−'}${fmt(t.amount)} €</div>
    <div class="det-sub">${isTra ? 'Банкомат' : esc(cat.name)} · ${dateLabel(t.date)}</div>
    <div class="det-row"><span class="det-l">Описание</span><span class="det-r">${esc(t.desc) || '—'}</span></div>
    ${isTra ? '' : `<div class="det-row"><span class="det-l">Категория</span><span class="det-r">${cat.icon} ${esc(cat.name)}</span></div>`}
    <div class="det-row"><span class="det-l">Счёт</span><span class="det-r">${isTra ? `${acctLabel(t.account)} → ${acctLabel(t.toAcct)}` : acctLabel(t.account)}</span></div>
    <div class="det-row"><span class="det-l">Дата</span><span class="det-r">${new Date(t.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
    ${t.note ? `<div class="det-row"><span class="det-l">Заметка</span><span class="det-r">${esc(t.note)}</span></div>` : ''}
    ${t.isRec ? '<div class="det-row"><span class="det-l">Тип</span><span class="det-r">🔁 Регулярный</span></div>' : ''}`;
  document.getElementById('det-edit-btn').onclick = () => { closeM('m-det'); openEditTx(id); };
  document.getElementById('det-del').onclick = () => {
    const idx = S.transactions.findIndex(x => x.id === id);
    const removed = S.transactions[idx];
    S.transactions = S.transactions.filter(x => x.id !== id);
    save(); closeM('m-det'); renderHome();
    if (curSc === 'transactions') renderTx();
    undoToast('🗑 Операция удалена', () => {
      S.transactions.splice(Math.min(idx, S.transactions.length), 0, removed);
      save(); renderHome(); if (curSc === 'transactions') renderTx();
    });
  };
  openM('m-det');
}

// ══════════════════════════════════════
// EDIT TX
// ══════════════════════════════════════
let editTxId = null;

function openEditTx(id) {
  editTxId = id;
  const t = S.transactions.find(x => x.id === id);
  if (!t) return;
  document.querySelectorAll('#etx-type-sw .tsw').forEach(b => b.classList.toggle('on', b.dataset.et === t.type));
  document.getElementById('etx-amt').value = t.amount;
  document.getElementById('etx-desc').value = t.desc || '';
  document.getElementById('etx-note').value = t.note || '';
  document.getElementById('etx-date').value = t.date;
  buildAcctPicker('etx-ap', 'ea', t.account || 'cash');
  // Передаём t.category прямо в buildCatPicker — он сразу выберет нужную
  const catType = t.type === 'transfer' ? 'expense' : t.type;
  buildCatPicker('etx-cat', catType, t.category);
  openM('m-edit-tx');
}

// Переключение типа в форме редактирования
document.querySelectorAll('#etx-type-sw .tsw').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#etx-type-sw .tsw').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  buildCatPicker('etx-cat', b.dataset.et === 'transfer' ? 'expense' : b.dataset.et);
}));

document.getElementById('etx-ok').addEventListener('click', () => {
  const t = S.transactions.find(x => x.id === editTxId);
  if (!t) return;
  const amount = parseFloat(document.getElementById('etx-amt').value);
  if (!amount || amount <= 0) { toast('Введи сумму'); return; }
  t.amount = amount;
  t.type = document.querySelector('#etx-type-sw .tsw.on')?.dataset.et || t.type;
  t.desc = document.getElementById('etx-desc').value.trim();
  t.note = document.getElementById('etx-note').value.trim();
  t.date = document.getElementById('etx-date').value || t.date;
  t.account = getAcctPicker('etx-ap', 'ea');
  t.category = getPickedCat('etx-cat');
  // Если операцию переключили в «Перевод», у неё должен быть счёт назначения,
  // иначе деньги «исчезнут» из балансов. Подставляем противоположный счёт.
  if (t.type === 'transfer') {
    if (!t.toAcct || t.toAcct === t.account) t.toAcct = t.account === 'cash' ? 'bank' : 'cash';
  } else {
    delete t.toAcct;
  }
  save(); closeM('m-edit-tx'); renderHome();
  if (curSc === 'transactions') renderTx();
  toast('✅ Операция обновлена');
});
let addType = 'expense';

function openAddM(type = 'expense') {
  addType = type;
  document.getElementById('add-amt').value = '';
  document.getElementById('add-desc').value = '';
  document.getElementById('add-note').value = '';
  document.getElementById('add-date').value = today();
  document.getElementById('add-rep').value = 'none';
  document.querySelectorAll('#add-type-sw .tsw').forEach(b => b.classList.toggle('on', b.dataset.t === addType));
  buildAcctPicker('add-ap', 'v', 'cash');
  // Reset ATM direction to default «withdraw»
  document.querySelectorAll('#add-atm-dir .apb').forEach(x => x.classList.remove('on'));
  document.querySelector('#add-atm-dir [data-dir="withdraw"]')?.classList.add('on');
  buildCatPicker('add-cat', addType);
  renderTmplSc();
  updateTransferUI();
  openM('m-add');
  setTimeout(() => document.getElementById('add-amt').focus(), 320);
}

function updateTransferUI() {
  const isAtm = addType === 'transfer'; // тип внутри стораджа остаётся transfer
  document.getElementById('add-atm-ff').style.display = isAtm ? '' : 'none';
  document.getElementById('add-acct-ff').style.display = isAtm ? 'none' : '';
  document.getElementById('add-rep-wrap').style.display = isAtm ? 'none' : '';
  // Скрываем категорию в режиме банкомата
  const catFF = document.getElementById('add-cat')?.closest('.ff');
  if (catFF) catFF.style.display = isAtm ? 'none' : '';
  if (isAtm) updateAtmHint();
}

function getAtmDir() {
  return document.querySelector('#add-atm-dir .apb.on')?.dataset.dir || 'withdraw';
}

function updateAtmHint() {
  const dir = getAtmDir();
  const hint = document.getElementById('add-atm-hint');
  if (!hint) return;
  if (dir === 'withdraw') hint.innerHTML = `Доступно на банке: <b style="color:var(--ink)">${fmt(acctBal('bank'))} €</b>`;
  else hint.innerHTML = `Доступно наличными: <b style="color:var(--ink)">${fmt(acctBal('cash'))} €</b>`;
}

// Привязываем переключение направления банкомата (статичные кнопки в add-modal)
document.querySelectorAll('#add-atm-dir .apb').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#add-atm-dir .apb').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  updateAtmHint();
}));


// type switch in add modal
document.querySelectorAll('#add-type-sw .tsw').forEach(b => b.addEventListener('click', () => {
  addType = b.dataset.t;
  document.querySelectorAll('#add-type-sw .tsw').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  buildCatPicker('add-cat', addType);
  renderTmplSc();
  updateTransferUI();
}));


document.getElementById('add-ok').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('add-amt').value);
  if (!amount || amount <= 0) { toast('Введи сумму'); return; }
  const desc = document.getElementById('add-desc').value.trim();
  const note = document.getElementById('add-note').value.trim();
  const date = document.getElementById('add-date').value || today();
  const rep = document.getElementById('add-rep').value;
  const account = getAcctPicker('add-ap', 'v');
  const category = getPickedCat('add-cat');

  if (addType === 'transfer') {
    // Банкомат: направление задаёт from/to
    const dir = getAtmDir(); // 'withdraw' (банк→нал) | 'deposit' (нал→банк)
    const fromAcct = dir === 'withdraw' ? 'bank' : 'cash';
    const toAcct = dir === 'withdraw' ? 'cash' : 'bank';
    const srcBal = acctBal(fromAcct);
    if (amount > srcBal) {
      toast(`⚠️ ${fromAcct === 'bank' ? 'На банке' : 'Наличными'} только ${fmt(srcBal)} €`);
      return;
    }
    const defDesc = dir === 'withdraw' ? 'Снятие в банкомате' : 'Внесение в банкомате';
    S.transactions.push({ id: uid(), type: 'transfer', amount, desc: desc || defDesc, note, date, account: fromAcct, toAcct, category: 'other', isRec: false });
    save(); closeM('m-add'); autoNotifs(); renderHome();
    if (curSc === 'transactions') renderTx();
    playAddSound();
    toast(dir === 'withdraw' ? `💵 Снято ${fmt(amount)} € в наличные` : `🏦 Внесено ${fmt(amount)} € на банк`);
    return;
  }

  const tx = { id: uid(), type: addType, amount, desc, note, date, account, category, isRec: rep !== 'none' };
  S.transactions.push(tx);
  if (rep !== 'none') {
    S.recurring.push({ id: 'r' + uid(), name: desc || getCat(category).name, amount, type: addType, freq: rep, day: ymd(date).d, category, icon: getCat(category).icon, account, createdAt: today() });
  }
  save(); closeM('m-add');
  autoNotifs(); renderHome();
  if (curSc === 'transactions') renderTx();
  playAddSound();
  toast(addType === 'income' ? '✅ Доход добавлен' : '✅ Расход добавлен');
});

// ══════════════════════════════════════
// TRANSACTIONS SCREEN
// ══════════════════════════════════════
let txF = 'all', txQ = '', txSort = 'newest', txCatF = 'all';

// Заполняем выпадающий фильтр категорий актуальным списком
function fillTxCatFilter() {
  const sel = document.getElementById('tx-cat-f');
  if (!sel) return;
  const cur = txCatF;
  sel.innerHTML = '<option value="all">Все категории</option>' +
    S.categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
  // Сохраняем выбор, если категория ещё существует
  sel.value = S.categories.some(c => c.id === cur) ? cur : 'all';
  txCatF = sel.value;
}

function renderTx() {
  fillTxCatFilter();
  let txs = [...S.transactions];
  if (txF === 'expense' || txF === 'income' || txF === 'transfer') txs = txs.filter(t => t.type === txF);
  else if (txF === 'cash') txs = txs.filter(t => t.account === 'cash');
  else if (txF === 'bank') txs = txs.filter(t => t.account === 'bank');
  if (txCatF !== 'all') txs = txs.filter(t => t.category === txCatF);
  if (txQ) { const q = txQ.toLowerCase(); txs = txs.filter(t => (t.desc || '').toLowerCase().includes(q) || getCat(t.category).name.toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q)); }
  if (txSort === 'newest') txs.sort((a, b) => new Date(b.date) - new Date(a.date));
  else if (txSort === 'oldest') txs.sort((a, b) => new Date(a.date) - new Date(b.date));
  else if (txSort === 'highest') txs.sort((a, b) => b.amount - a.amount);
  else txs.sort((a, b) => a.amount - b.amount);
  const list = document.getElementById('all-txl');
  if (!txs.length) { list.innerHTML = '<div class="empty" style="margin:0 22px"><span class="ei">🔍</span><p>Ничего не найдено</p></div>'; return; }
  // Only group by date when sorting by date, not by amount
  if (txSort === 'newest' || txSort === 'oldest') {
    const groups = {};
    txs.forEach(t => { if (!groups[t.date]) groups[t.date] = []; groups[t.date].push(t); });
    list.innerHTML = Object.entries(groups)
      .sort((a,b) => txSort === 'newest' ? new Date(b[0])-new Date(a[0]) : new Date(a[0])-new Date(b[0]))
      .map(([d, items]) => `<div class="txdg">${dateLabel(d)} · ${items.length}</div>${items.map(txHTML).join('')}`).join('');
  } else {
    list.innerHTML = txs.map(txHTML).join('');
  }
  list.querySelectorAll('.tx').forEach(el => el.addEventListener('click', () => openDet(el.dataset.id)));
}

document.querySelectorAll('#sc-transactions .chip').forEach(c => c.addEventListener('click', () => {
  document.querySelectorAll('#sc-transactions .chip').forEach(x => x.classList.remove('on'));
  c.classList.add('on'); txF = c.dataset.f; renderTx();
}));
document.getElementById('tx-cat-f').addEventListener('change', e => { txCatF = e.target.value; renderTx(); });
document.getElementById('tx-q').addEventListener('input', e => { txQ = e.target.value; document.getElementById('tx-x').style.display = txQ ? '' : 'none'; renderTx(); });
document.getElementById('tx-x').addEventListener('click', () => { document.getElementById('tx-q').value = ''; txQ = ''; document.getElementById('tx-x').style.display = 'none'; renderTx(); });
document.getElementById('tx-sort-btn').addEventListener('click', () => {
  const opts = ['newest', 'oldest', 'highest', 'lowest'];
  const lbls = ['📅 Новые', '📅 Старые', '💶 Крупные', '💶 Мелкие'];
  const i = opts.indexOf(txSort);
  txSort = opts[(i + 1) % opts.length];
  toast(lbls[(i + 1) % lbls.length]);
  renderTx();
});

// ══════════════════════════════════════
// STATS
// ══════════════════════════════════════
let statP = 'week', statFrom = '', statTo = '';

document.querySelectorAll('.pt').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.pt').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); statP = b.dataset.p;
  const range = document.getElementById('stat-range');
  if (statP === 'custom') {
    if (!statTo) statTo = today();
    if (!statFrom) { const f = new Date(); f.setDate(f.getDate() - 30); statFrom = f.toISOString().split('T')[0]; }
    document.getElementById('stat-from').value = statFrom;
    document.getElementById('stat-to').value = statTo;
    if (range) range.style.display = '';
  } else if (range) { range.style.display = 'none'; }
  renderStats();
}));

const statFromEl = document.getElementById('stat-from');
if (statFromEl) statFromEl.addEventListener('change', e => { statFrom = e.target.value; renderStats(); });
const statToEl = document.getElementById('stat-to');
if (statToEl) statToEl.addEventListener('change', e => { statTo = e.target.value; renderStats(); });

// Единый источник правды для границ выбранного периода
function periodRange() {
  const now = new Date();
  let start, end = new Date(now); end.setHours(23, 59, 59, 999);
  if (statP === 'week') { start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0,0,0,0); }
  else if (statP === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); }
  else if (statP === '3month') { start = new Date(now); start.setMonth(now.getMonth() - 2); start.setDate(1); start.setHours(0,0,0,0); }
  else if (statP === 'year') { start = new Date(now.getFullYear(), 0, 1); }
  else if (statP === 'custom') {
    start = statFrom ? new Date(statFrom + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), 1);
    end = statTo ? new Date(statTo + 'T23:59:59') : end;
  } else { start = new Date(now.getFullYear(), 0, 1); }
  const days = Math.max(Math.floor((end - start) / 86400000) + 1, 1);
  return { start, end, days };
}

const dStr = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');

function getPTxs() {
  const { start, end } = periodRange();
  const s = dStr(start), e = dStr(end);
  return S.transactions.filter(t => t.date >= s && t.date <= e);
}

function renderStats() {
  const txs = getPTxs();
  const inc = txs.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const exp = txs.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const PLBLS = { week: 'ЗА НЕДЕЛЮ', month: 'ЗА МЕСЯЦ', '3month': 'ЗА 3 МЕСЯЦА', year: 'ЗА ГОД', custom: 'ЗА ПЕРИОД' };
  document.getElementById('stp-lbl').textContent = PLBLS[statP];
  const { start, end, days } = periodRange();
  const fmtD = d => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const rangeEl = document.getElementById('stp-range');
  if (rangeEl) rangeEl.textContent = fmtD(start) + ' — ' + fmtD(end);
  document.getElementById('stp-tot').textContent = fmt(inc - exp) + ' €';
  document.getElementById('stp-inc').textContent = fmt(inc) + ' €';
  document.getElementById('stp-exp').textContent = fmt(exp) + ' €';
  document.getElementById('stp-cnt').textContent = txs.length;
  document.getElementById('st-avg').textContent = fmt(exp / Math.max(days, 1)) + ' €';
  const maxTx = [...txs].filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount)[0];
  document.getElementById('st-max').textContent = maxTx ? fmt(maxTx.amount) + ' €' : '0 €';
  document.getElementById('st-maxs').textContent = maxTx ? (maxTx.desc || getCat(maxTx.category).name) : '—';
  document.getElementById('st-sav').textContent = fmt(inc - exp) + ' €';
  document.getElementById('st-rt').textContent = inc > 0 ? Math.round((inc - exp) / inc * 100) + '%' : '0%';
  renderBars(txs); renderRing(txs); renderLine(txs);
  const top = [...txs].filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5);
  const tl = document.getElementById('top-txl');
  tl.innerHTML = top.length ? top.map(txHTML).join('') : '<div class="empty" style="margin:0 22px;padding:28px 0"><p>Нет данных</p></div>';
  tl.querySelectorAll('.tx').forEach(el => el.addEventListener('click', () => openDet(el.dataset.id)));
}

function renderBars(txs) {
  const now = new Date(); let pts = [];
  const sumI = dt => dt.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const sumE = dt => dt.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  if (statP === 'week') { for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(now.getDate() - i); const k = dStr(d); const dt = txs.filter(t => t.date === k); pts.push({ l: DAYS[d.getDay()], i: sumI(dt), e: sumE(dt) }); } }
  else if (statP === 'month') { const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); for (let i = 1; i <= dim; i += 3) { const dt = txs.filter(t => { const dd = ymd(t.date).d; return dd >= i && dd < i + 3; }); pts.push({ l: '' + i, i: sumI(dt), e: sumE(dt) }); } }
  else if (statP === '3month') { for (let m = 2; m >= 0; m--) { const mo = new Date(now.getFullYear(), now.getMonth() - m, 1); const dt = txs.filter(t => { const d = ymd(t.date); return d.m === mo.getMonth() && d.y === mo.getFullYear(); }); pts.push({ l: MONTHS[mo.getMonth()], i: sumI(dt), e: sumE(dt) }); } }
  else if (statP === 'custom') {
    // Произвольный период: до ~12 столбцов, равномерно по выбранному диапазону.
    const { start, days } = periodRange();
    const buckets = Math.min(12, Math.max(1, days));
    for (let b = 0; b < buckets; b++) {
      const bs = new Date(start); bs.setDate(start.getDate() + Math.floor(b * days / buckets)); bs.setHours(0, 0, 0, 0);
      const be = new Date(start); be.setDate(start.getDate() + Math.floor((b + 1) * days / buckets) - 1); be.setHours(23, 59, 59, 999);
      const k0 = dStr(bs), k1 = dStr(be);
      const dt = txs.filter(t => t.date >= k0 && t.date <= k1);
      const l = days <= 31 ? '' + bs.getDate() : `${bs.getDate()}.${bs.getMonth() + 1}`;
      pts.push({ l, i: sumI(dt), e: sumE(dt) });
    }
  }
  else { for (let m = 0; m < 12; m++) { const dt = txs.filter(t => ymd(t.date).m === m); pts.push({ l: MONTHS[m][0], i: sumI(dt), e: sumE(dt) }); } }
  const mx = Math.max(...pts.map(p => Math.max(p.i, p.e)), 1);
  document.getElementById('st-bars').innerHTML = pts.map(p => `<div class="bgw"><div class="bpr"><div class="bar i" style="height:${Math.round(p.i / mx * 82)}px"></div><div class="bar e" style="height:${Math.round(p.e / mx * 82)}px"></div></div><div class="blbl">${p.l}</div></div>`).join('');
}

function renderRing(txs) {
  const exps = txs.filter(t => t.type === 'expense');
  const total = exps.reduce((a, t) => a + t.amount, 0);
  const svg = document.getElementById('ring-svg'), leg = document.getElementById('ring-leg');
  const R = 44, cx = 56, cy = 56, circ = 2 * Math.PI * R;
  if (!total) { svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#2c2c2e" stroke-width="16"/>`; leg.innerHTML = '<div style="font-size:12px;color:var(--ink3);font-weight:500">Нет данных</div>'; return; }
  const bycat = {};
  exps.forEach(t => bycat[t.category] = (bycat[t.category] || 0) + t.amount);
  const sorted = Object.entries(bycat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  let off = 0, segs = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#2c2c2e" stroke-width="16"/>`;
  sorted.forEach(([id, amt]) => { const cat = getCat(id); const pct = amt / total; const dash = pct * circ * .94; segs += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${cat.color}" stroke-width="16" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"/>`; off += pct * circ; });
  svg.innerHTML = segs;
  leg.innerHTML = sorted.map(([id, amt]) => { const cat = getCat(id); return `<div class="rli"><div class="rl-dot" style="background:${cat.color}"></div><div class="rl-n">${cat.icon} ${cat.name}</div><div class="rl-p">${Math.round(amt / total * 100)}%</div></div>`; }).join('');
}

function renderLine(periodTxs) {
  // Динамика баланса В РАМКАХ выбранного периода (а не за всю историю):
  // строим накопительную сумму доход − расход начиная с нуля.
  const src = periodTxs && periodTxs.length ? periodTxs : [];
  const sorted = [...src].sort((a, b) => new Date(a.date) - new Date(b.date));
  let run = 0; const pts = [];
  sorted.forEach(t => { run += t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0; pts.push(run); });
  const svg = document.getElementById('line-svg');
  if (pts.length < 2) { svg.innerHTML = '<text x="170" y="45" text-anchor="middle" fill="#6e6e73" font-size="13" font-family="Satoshi">Недостаточно данных</text>'; return; }
  const minV = Math.min(...pts), maxV = Math.max(...pts), range = maxV - minV || 1;
  const W = 340, H = 80, pad = 8;
  const xs = pts.map((v, i) => pad + (i / (pts.length - 1)) * (W - pad * 2));
  const ys = pts.map(v => H - pad - (v - minV) / range * (H - pad * 2));
  const path = 'M ' + xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' L ');
  const fill = path + ` L ${xs[xs.length - 1]},${H} L ${xs[0]},${H} Z`;
  const color = pts[pts.length - 1] >= pts[0] ? '#00B876' : '#E8304A';
  svg.innerHTML = `<defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".2"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${fill}" fill="url(#lg)"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// ══════════════════════════════════════
// CATEGORIES
// ══════════════════════════════════════
let catFilter = 'all';
document.querySelectorAll('#sc-categories .cf').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('#sc-categories .cf').forEach(x => x.classList.remove('on')); b.classList.add('on'); catFilter = b.dataset.ct; renderCats(); }));

function buildCatHTML(cat, mTxs, mExp) {
  const mAmt = mTxs.filter(t => t.category === cat.id && t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const cnt = S.transactions.filter(t => t.category === cat.id).length;
  const hasBudget = cat.budget > 0 && cat.type !== 'income';
  let barPct, barColor, sub;
  if (hasBudget) {
    const over = mAmt > cat.budget;
    barPct = Math.min(mAmt / cat.budget * 100, 100);
    barColor = over ? 'var(--rd)' : (mAmt / cat.budget > 0.85 ? 'var(--am)' : cat.color);
    sub = over
      ? `${fmt(mAmt)} из ${fmt(cat.budget)} € · превышен на ${fmt(mAmt - cat.budget)} €`
      : `${fmt(mAmt)} из ${fmt(cat.budget)} € · осталось ${fmt(cat.budget - mAmt)} €`;
  } else {
    barPct = mExp ? Math.min(mAmt / mExp * 100, 100) : 0;
    barColor = cat.color;
    sub = `${cnt} операций · ${Math.round(barPct)}% расходов`;
  }
  return `<div class="cat-row" data-cid="${cat.id}">
    <div class="cat-main">
      <div class="cat-ico" style="background:${cat.color}15">${cat.icon}</div>
      <div class="cat-body">
        <div class="cat-name">${esc(cat.name)}${hasBudget ? ' <span class="cat-budget-tag">бюджет</span>' : ''}</div>
        <div class="cat-bar-w"><div class="cat-bar-f" style="width:${barPct}%;background:${barColor}"></div></div>
        <div class="cat-sub">${sub}</div>
      </div>
      <div class="cat-right">
        <div class="cat-amt" style="color:${hasBudget && mAmt > cat.budget ? 'var(--rd)' : cat.color}">${fmt(mAmt)} €</div>
        <div class="cat-cnt">${hasBudget ? 'из ' + fmt(cat.budget) + ' €' : 'за месяц'}</div>
      </div>
    </div>
    <div class="cat-actions">
      <button class="cat-btn edit-btn" data-cid="${cat.id}">✏️ Изменить</button>
      <button class="cat-btn del del-btn" data-cid="${cat.id}">🗑 Удалить</button>
    </div>
  </div>`;
}

function bindCatButtons(list) {
  list.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); openCatEdit(btn.dataset.cid); });
  });
  list.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); deleteCat(btn.dataset.cid); });
  });
}

function renderCats() {
  const mTxs = getMonthTxs();
  const mExp = mTxs.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const cats = catFilter === 'all' ? S.categories : S.categories.filter(c => c.type === catFilter || c.type === 'both');
  const list = document.getElementById('cat-list');
  list.innerHTML = cats.map(cat => buildCatHTML(cat, mTxs, mExp)).join('');
  bindCatButtons(list);
}

function openCatAdd() {
  document.getElementById('cadd-name').value = '';
  document.getElementById('cadd-type').value = 'expense';
  document.getElementById('cadd-budget').value = '';
  buildEmoji('cadd-emoji');       // первый выбран по умолчанию
  buildColor('cadd-color');        // первый выбран по умолчанию
  openM('m-cadd');
}
document.getElementById('cadd-ok').addEventListener('click', () => {
  const name = document.getElementById('cadd-name').value.trim();
  if (!name) { toast('Введи название'); return; }
  const budget = parseFloat(document.getElementById('cadd-budget').value);
  S.categories.push({ id: 'c' + uid(), name, icon: getEmoji('cadd-emoji'), color: getColor('cadd-color'), type: document.getElementById('cadd-type').value, budget: budget > 0 ? budget : undefined });
  save(); closeM('m-cadd'); renderCats(); renderFSCats();
  document.getElementById('p-cats-cnt').textContent = S.categories.length + ' категорий';
  document.getElementById('ps-cat').textContent = S.categories.length;
  toast('✅ Категория добавлена');
});

let editCatId = null;
function openCatEdit(cid) {
  editCatId = cid;
  const cat = S.categories.find(c => c.id === cid);
  if (!cat) return;
  const txc = S.transactions.filter(t => t.category === cid).length;
  document.getElementById('cedit-info').innerHTML = `
    <div class="cu-ico">${cat.icon}</div>
    <div class="cu-b">
      <div class="cu-n">${esc(cat.name)}</div>
      <div class="cu-s">${txc} операций</div>
      ${txc > 0 ? '<div class="cu-w">При удалении операции переходят в «Другое»</div>' : ''}
    </div>`;
  document.getElementById('cedit-name').value = cat.name;
  document.getElementById('cedit-type').value = cat.type;
  document.getElementById('cedit-budget').value = cat.budget > 0 ? cat.budget : '';
  // Передаём текущие значения прямо в build — они будут выбраны сразу
  buildEmoji('cedit-emoji', ALL_EMO, cat.icon);
  buildColor('cedit-color', cat.color);
  openM('m-cedit');
}
document.getElementById('cedit-save').addEventListener('click', () => {
  const cat = S.categories.find(c => c.id === editCatId);
  if (!cat) return;
  const name = document.getElementById('cedit-name').value.trim();
  if (!name) { toast('Введи название'); return; }
  cat.name = name; cat.type = document.getElementById('cedit-type').value;
  cat.icon = getEmoji('cedit-emoji'); cat.color = getColor('cedit-color');
  const eb = parseFloat(document.getElementById('cedit-budget').value);
  if (eb > 0) cat.budget = eb; else delete cat.budget;
  save(); closeM('m-cedit'); renderCats(); renderFSCats(); toast('✅ Категория обновлена');
});
document.getElementById('cedit-del').addEventListener('click', () => deleteCat(editCatId, true));

function deleteCat(cid, fromModal = false) {
  const cat = S.categories.find(c => c.id === cid);
  if (!cat) return;
  const txc = S.transactions.filter(t => t.category === cid).length;
  confirmSheet({
    title: 'Удалить категорию?',
    text: `${cat.icon} «${esc(cat.name)}»${txc > 0 ? `<br><span style="color:var(--am);font-weight:600">⚠️ ${txc} операций перейдут в «Другое»</span>` : ''}`,
    onOk: () => {
      const idx = S.categories.findIndex(c => c.id === cid);
      const affected = S.transactions.filter(t => t.category === cid).map(t => t.id);
      S.transactions.forEach(t => { if (t.category === cid) t.category = 'other'; });
      S.categories = S.categories.filter(c => c.id !== cid);
      save();
      if (fromModal) closeM('m-cedit');
      renderCats(); renderFSCats();
      const setCnt = () => { document.getElementById('p-cats-cnt').textContent = S.categories.length + ' категорий'; document.getElementById('ps-cat').textContent = S.categories.length; };
      setCnt();
      undoToast('🗑 Категория удалена', () => {
        S.categories.splice(Math.min(idx, S.categories.length), 0, cat);
        const aset = new Set(affected);
        S.transactions.forEach(t => { if (aset.has(t.id)) t.category = cid; });
        save(); renderCats(); renderFSCats(); setCnt();
      });
    }
  });
}

// ══════════════════════════════════════
// GOALS
// ══════════════════════════════════════
let goalEditId = null;

function renderGoals() {
  const list = document.getElementById('goal-list');
  if (!S.goals.length) { list.innerHTML = '<div class="empty" style="margin:0 22px"><span class="ei">🎯</span><p>Нет целей.<br>Создай первую финансовую цель!</p></div>'; return; }
  list.innerHTML = S.goals.map(g => {
    const pct = Math.min(g.current / g.target * 100, 100);
    const rem = Math.max(g.target - g.current, 0);
    const dl = g.deadline ? Math.ceil((new Date(g.deadline) - new Date()) / 86400000) : null;
    const mn = dl && dl > 0 ? rem / (dl / 30) : null;
    return `<div class="gcard" data-gid="${g.id}">
      <div class="gcard-top-stripe" style="background:${g.color || '#2B6FED'}"></div>
      <div class="gc-top">
        <div class="gc-ico" style="background:${g.color || '#2B6FED'}15">${g.icon || '🎯'}</div>
        <div class="gc-info"><div class="gc-name">${esc(g.name)}</div><div class="gc-dl">${g.deadline ? new Date(g.deadline).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Без срока'}${mn && mn > 0 ? ` · ~${fmt(mn)} €/мес` : ''}</div></div>
        <div class="gc-pct" style="color:${g.color || '#2B6FED'}">${Math.round(pct)}%</div>
      </div>
      <div class="gc-bar"><div class="gc-bar-f" style="width:${pct}%;background:${g.color || '#2B6FED'}"></div></div>
      <div class="gc-amts"><div><span class="gc-cur">${fmt(g.current)} €</span> накоплено</div><div>Осталось: ${fmt(rem)} €</div></div>
      <div class="gc-actions">
        <button class="gc-btn-add" data-gid="${g.id}">+ Пополнить</button>
        <button class="gc-btn-edit" data-gid="${g.id}">✏️</button>
        <button class="gc-btn-del" data-gid="${g.id}">🗑</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.gcard').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.gc-btn-add,.gc-btn-edit,.gc-btn-del')) return;
      openGoalDet(el.dataset.gid);
    });
  });

  list.querySelectorAll('.gc-btn-add').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    openGoalContrib(btn.dataset.gid);
  }));
  list.querySelectorAll('.gc-btn-edit').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    openGoalM(btn.dataset.gid);
  }));
  list.querySelectorAll('.gc-btn-del').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const g = S.goals.find(x => x.id === btn.dataset.gid);
    if (!g) return;
    confirmSheet({
      title: 'Удалить цель?',
      text: `${g.icon || '🎯'} «${esc(g.name)}» — ${fmt(g.current)} / ${fmt(g.target)} €`,
      onOk: () => {
        const idx = S.goals.findIndex(x => x.id === g.id);
        S.goals = S.goals.filter(x => x.id !== g.id); save(); renderGoals();
        undoToast('🗑 Цель удалена', () => { S.goals.splice(Math.min(idx, S.goals.length), 0, g); save(); renderGoals(); });
      }
    });
  }));
}

function openGoalContrib(gid) {
  const g = S.goals.find(x => x.id === gid);
  if (!g) return;
  const { ov, close } = openSheet(`
    <div class="cdlg-t">${g.icon || '🎯'} ${esc(g.name)}</div>
    <div class="cdlg-s">Накоплено ${fmt(g.current)} € из ${fmt(g.target)} €</div>
    <div class="amt-blk"><div class="amt-sym">€</div><input class="amt-inp" id="gc-amt-input" type="number" placeholder="0,00" inputmode="decimal"></div>
    <button class="btn btn-g" id="gc-ok" style="margin-top:4px">Пополнить</button>
  `);
  setTimeout(() => document.getElementById('gc-amt-input')?.focus(), 100);
  document.getElementById('gc-ok').onclick = () => {
    const amt = parseFloat(document.getElementById('gc-amt-input').value);
    if (!amt || amt <= 0) { toast('Введи сумму'); return; }
    g.current += amt;
    if (!g.contributions) g.contributions = [];
    g.contributions.push({ amount: amt, date: today() });
    save(); close(); renderGoals(); autoNotifs();
    if (g.current >= g.target) { launchConfetti(); toast('🎉 Цель достигнута!'); }
    else toast('✅ Пополнено на ' + fmt(amt) + ' €');
  };
}

function openGoalDet(gid) {
  const g = S.goals.find(x => x.id === gid);
  if (!g) return;
  const pct = Math.min(g.current / g.target * 100, 100);
  const ctrbs = g.contributions || [];
  document.getElementById('gdet-body').innerHTML = `
    <div class="gd-hero">
      <div class="gd-ico">${g.icon || '🎯'}</div>
      <div class="gd-name">${esc(g.name)}</div>
      <div class="gd-pct" style="color:${g.color || '#2B6FED'}">${Math.round(pct)}%</div>
      <div class="gd-bar"><div class="gd-bar-f" style="width:${pct}%;background:${g.color || '#2B6FED'}"></div></div>
      <div class="gd-row"><span>${fmt(g.current)} € накоплено</span><span>Цель: ${fmt(g.target)} €</span></div>
    </div>
    ${ctrbs.length ? `<div style="font-size:11px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">История</div><div class="ctrb">${ctrbs.slice(-6).reverse().map(c => `<div class="ctrb-i"><span>${new Date(c.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span><span class="ctrb-a">+${fmt(c.amount)} €</span></div>`).join('')}</div>` : ''}`;
  document.getElementById('gdet-add').onclick = () => { closeM('m-gdet'); openGoalContrib(gid); };
  document.getElementById('gdet-del').onclick = () => {
    closeM('m-gdet');
    confirmSheet({
      title: 'Удалить цель?',
      text: `${g.icon || '🎯'} «${esc(g.name)}» — ${fmt(g.current)} / ${fmt(g.target)} €`,
      onOk: () => {
        const idx = S.goals.findIndex(x => x.id === gid);
        S.goals = S.goals.filter(x => x.id !== gid); save(); renderGoals();
        undoToast('🗑 Цель удалена', () => { S.goals.splice(Math.min(idx, S.goals.length), 0, g); save(); renderGoals(); });
      }
    });
  };
  openM('m-gdet');
}

function openGoalM(gid = null) {
  goalEditId = gid;
  const g = gid ? S.goals.find(x => x.id === gid) : null;
  document.getElementById('gadd-t').textContent = g ? 'Редактировать цель' : 'Новая цель';
  document.getElementById('gadd-ok').textContent = g ? 'Сохранить изменения' : 'Создать цель';
  document.getElementById('gadd-name').value = g ? g.name : '';
  document.getElementById('gadd-target').value = g ? g.target : '';
  document.getElementById('gadd-cur').value = g ? g.current : '';
  document.getElementById('gadd-dl').value = g ? (g.deadline || '') : '';
  buildEmoji('gadd-emoji', GOAL_EMO, g?.icon || null);
  buildColor('gadd-color', g?.color || null);
  openM('m-gadd');
}
document.getElementById('gadd-ok').addEventListener('click', () => {
  const name = document.getElementById('gadd-name').value.trim();
  const target = parseFloat(document.getElementById('gadd-target').value);
  if (!name || !target) { toast('Введи название и сумму'); return; }
  const obj = { name, target, current: parseFloat(document.getElementById('gadd-cur').value) || 0, deadline: document.getElementById('gadd-dl').value, icon: getEmoji('gadd-emoji'), color: getColor('gadd-color') };
  if (goalEditId) { const g = S.goals.find(x => x.id === goalEditId); if (g) { const existingContribs = g.contributions; Object.assign(g, obj); g.contributions = existingContribs; } }
  else S.goals.push({ id: 'g' + uid(), ...obj });
  save(); closeM('m-gadd'); renderGoals();
  addNotif('Цель создана', `«${name}» — ${fmt(target)} €`, '🎯', 'success');
  toast('✅ Цель сохранена');
});

// ══════════════════════════════════════
// RECURRING
// ══════════════════════════════════════
// ══════════════════════════════════════
// RECURRING — with edit & delete
// ══════════════════════════════════════
let editRecId = null;

function renderRec() {
  // «В месяц» = регулярные расходы в месячном эквиваленте (доходы не вычитаем).
  const monthly = S.recurring.reduce((a, r) => {
    if ((r.type || 'expense') !== 'expense') return a;
    const mul = {monthly:1, weekly:4.33, yearly:1/12, quarterly:1/3, daily:30}[r.freq] || 1;
    return a + r.amount * mul;
  }, 0);
  document.getElementById('rec-tot').textContent = fmt(monthly) + ' €';
  document.getElementById('rec-cnt').textContent = S.recurring.length + ' платежей';
  const list = document.getElementById('rec-list');
  if (!S.recurring.length) { list.innerHTML = '<div class="empty" style="margin:0 22px"><span class="ei">🔁</span><p>Нет регулярных платежей</p></div>'; return; }
  const now = new Date();
  const td = today();
  list.innerHTML = S.recurring.map(r => {
    const day = r.day || 1;
    let nd = new Date(now.getFullYear(), now.getMonth(), day);
    if (nd <= now) nd = new Date(now.getFullYear(), now.getMonth() + 1, day);
    const dl = Math.ceil((nd - now) / 86400000);
    const paidToday = r.lastPaid === td;
    return `<div class="rec-c" data-rid="${r.id}">
      <div class="rec-main">
        <div class="rec-ico" style="background:${getCat(r.category || 'other').color}15">${r.icon || getCat(r.category || 'other').icon}</div>
        <div class="rec-b">
          <div class="rec-n">${esc(r.name)}</div>
          <div class="rec-f"><span class="pill rec">${FREQ[r.freq] || r.freq}</span>${r.day ? `<span style="font-size:10px;color:var(--ink4)">· ${r.day}-го</span>` : ''}</div>
        </div>
        <div class="rec-r">
          <div class="rec-a"${(r.type === 'income') ? ' style="color:var(--gr)"' : ''}>${(r.type === 'income') ? '+' : '−'}${fmt(r.amount)} €</div>
          <div class="rec-nx">${paidToday ? (r.type === 'income' ? 'зачислено сегодня' : 'оплачено сегодня') : 'через ' + dl + ' дн.'}</div>
        </div>
      </div>
      <div class="rec-actions">
        <button class="rec-pay-btn" data-rid="${r.id}" ${paidToday ? 'disabled' : ''}>${r.type === 'income' ? (paidToday ? '✓ Получено' : '✓ Получить') : (paidToday ? '✓ Оплачено' : '✓ Оплатить')}</button>
        <button class="rec-edit-btn" data-rid="${r.id}">✏️</button>
        <button class="rec-del-btn" data-rid="${r.id}">🗑</button>
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('.rec-pay-btn').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    if (!btn.disabled) payRecurring(btn.dataset.rid);
  }));
  list.querySelectorAll('.rec-edit-btn').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    openRecEdit(btn.dataset.rid);
  }));
  list.querySelectorAll('.rec-del-btn').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    e.preventDefault();
    const r = S.recurring.find(x => x.id === btn.dataset.rid);
    if (!r) return;
    confirmSheet({
      title: 'Удалить платёж?',
      text: `«${esc(r.name)}» — ${fmt(r.amount)} €`,
      onOk: () => {
        const idx = S.recurring.findIndex(x => x.id === r.id);
        S.recurring = S.recurring.filter(x => x.id !== r.id); save(); renderRec();
        undoToast('🗑 Платёж удалён', () => { S.recurring.splice(Math.min(idx, S.recurring.length), 0, r); save(); renderRec(); });
      }
    });
  }));
}

// Авто-проведение просроченных ежемесячных платежей при запуске.
// Надёжно работает для freq='monthly' (день = число месяца). Недельные/годовые
// оставляем на ручное проведение, чтобы не угадывать дату.
function autoPostRecurring() {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const todayStr = today();
  let posted = 0;
  (S.recurring || []).forEach(r => {
    if ((r.freq || 'monthly') !== 'monthly') return;
    if (!r.createdAt) { r.createdAt = todayStr; return; } // только вперёд для старых платежей
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    let due = new Date(now.getFullYear(), now.getMonth(), Math.min(r.day || 1, dim));
    if (due > now) {
      const pm = new Date(now.getFullYear(), now.getMonth(), 0);
      due = new Date(pm.getFullYear(), pm.getMonth(), Math.min(r.day || 1, pm.getDate()));
    }
    const dueStr = dStr(due);
    if (dueStr < r.createdAt) return;             // до создания платежа
    if (r.lastPaid && r.lastPaid >= dueStr) return; // уже проведено за этот период
    const type = r.type || 'expense';
    S.transactions.push({ id: uid(), type, amount: r.amount, desc: r.name, note: '', date: dueStr, account: r.account || 'cash', category: r.category || 'other', isRec: true, recId: r.id });
    r.lastPaid = dueStr;
    posted++;
  });
  if (posted) { save(); toast(`🔁 Автоматически проведено: ${posted}`); }
  return posted;
}

// Провести регулярный платёж — создаёт реальную операцию
function payRecurring(rid) {
  const r = S.recurring.find(x => x.id === rid);
  if (!r) return;
  const type = r.type || 'expense';
  S.transactions.push({ id: uid(), type, amount: r.amount, desc: r.name, note: '', date: today(), account: r.account || 'cash', category: r.category || 'other', isRec: true, recId: r.id });
  r.lastPaid = today();
  save();
  renderRec(); renderHome();
  if (curSc === 'transactions') renderTx();
  playAddSound();
  toast(`✅ ${r.name}: ${type === 'income' ? '+' : '−'}${fmt(r.amount)} €`);
}

let recType = 'expense';
function setRecType(t) {
  recType = t;
  document.querySelectorAll('#radd-type-sw .tsw').forEach(b => b.classList.toggle('on', b.dataset.rt === t));
  buildCatPicker('radd-cat', t);
}
document.querySelectorAll('#radd-type-sw .tsw').forEach(b => b.addEventListener('click', () => setRecType(b.dataset.rt)));

function openRecM() {
  editRecId = null;
  document.getElementById('radd-title').textContent = 'Регулярная операция';
  document.getElementById('radd-ok').textContent = 'Добавить';
  document.getElementById('radd-name').value = '';
  document.getElementById('radd-amt').value = '';
  document.getElementById('radd-day').value = '1';
  document.getElementById('radd-freq').value = 'monthly';
  setRecType('expense');
  buildAcctPicker('radd-ap', 'ra', 'cash');
  buildEmoji('radd-emoji');
  openM('m-radd');
}

function openRecEdit(rid) {
  editRecId = rid;
  const r = S.recurring.find(x => x.id === rid);
  if (!r) return;
  document.getElementById('radd-title').textContent = 'Редактировать операцию';
  document.getElementById('radd-ok').textContent = 'Сохранить';
  document.getElementById('radd-name').value = r.name;
  document.getElementById('radd-amt').value = r.amount;
  document.getElementById('radd-day').value = r.day || 1;
  document.getElementById('radd-freq').value = r.freq || 'monthly';
  setRecType(r.type || 'expense');
  buildAcctPicker('radd-ap', 'ra', r.account || 'cash');
  buildCatPicker('radd-cat', r.type || 'expense', r.category);
  buildEmoji('radd-emoji', ALL_EMO, r.icon || null);
  openM('m-radd');
}

document.getElementById('radd-ok').addEventListener('click', () => {
  const name = document.getElementById('radd-name').value.trim();
  const amount = parseFloat(document.getElementById('radd-amt').value);
  if (!name || !amount) { toast('Введи название и сумму'); return; }
  const data = {
    name, amount,
    type: recType,
    freq: document.getElementById('radd-freq').value,
    day: parseInt(document.getElementById('radd-day').value) || 1,
    account: getAcctPicker('radd-ap', 'ra'),
    category: getPickedCat('radd-cat'),
    icon: getEmoji('radd-emoji'),
  };
  if (editRecId) {
    const r = S.recurring.find(x => x.id === editRecId);
    if (r) Object.assign(r, data);
    save(); closeM('m-radd'); renderRec(); toast('✅ Платёж обновлён');
  } else {
    S.recurring.push({ id: 'r' + uid(), ...data, createdAt: today() });
    save(); closeM('m-radd'); renderRec();
    toast('✅ Платёж добавлен');
  }
});

// ══════════════════════════════════════
// TEMPLATES
// ══════════════════════════════════════
let tmplType = 'expense';
let tuseId = null;

function deleteTmpl(id, afterDelete) {
  const t = S.templates.find(x => x.id === id);
  if (!t) return;
  confirmSheet({
    title: 'Удалить шаблон?',
    text: `${t.icon || '⚡'} «${esc(t.name)}» — ${t.type === 'income' ? '+' : '−'}${fmt(t.amount)} €`,
    onOk: () => {
      const idx = S.templates.findIndex(x => x.id === id);
      const removed = S.templates[idx];
      S.templates = S.templates.filter(x => x.id !== id);
      save();
      renderTemplates(); renderFSTemplates();
      const cnt = document.getElementById('p-tmpl-cnt');
      if (cnt) cnt.textContent = S.templates.length + ' шаблонов';
      undoToast('🗑 Шаблон удалён', () => {
        S.templates.splice(Math.min(idx, S.templates.length), 0, removed);
        save(); renderTemplates(); renderFSTemplates();
        if (cnt) cnt.textContent = S.templates.length + ' шаблонов';
      });
      afterDelete?.();
    }
  });
}

function buildTmplHTML(t) {
  return `<div class="tc" data-tid="${t.id}">
    <button class="tc-del" data-del="${t.id}" title="Удалить">×</button>
    <button class="tc-edit" data-edit="${t.id}" title="Изменить">✏️</button>
    <div class="tc-ico">${t.icon || '⚡'}</div>
    <div class="tc-name">${esc(t.name)}</div>
    <div class="tc-amt ${t.type}">${t.type === 'income' ? '+' : '−'}${fmt(t.amount)} €</div>
    <div class="tc-cat">${esc(getCat(t.category).name)} · ${t.account === 'cash' ? '💵 Нал' : '🏦 Банк'}</div>
  </div>`;
}

function bindTmplButtons(grid) {
  grid.querySelectorAll('.tc-del').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); deleteTmpl(btn.dataset.del); });
  });
  grid.querySelectorAll('.tc-edit').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); openTmplEdit(btn.dataset.edit); });
  });
  grid.querySelectorAll('.tc').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.tc-del') || e.target.closest('.tc-edit')) return;
      openTuseM(el.dataset.tid);
    });
  });
}

let editTmplId = null;

function openTmplEdit(tid) {
  editTmplId = tid;
  const t = S.templates.find(x => x.id === tid);
  if (!t) return;
  tmplType = t.type;
  document.getElementById('tadd-title').textContent = 'Редактировать шаблон';
  document.getElementById('tadd-sub').textContent = 'Изменить параметры шаблона';
  document.getElementById('tadd-ok').textContent = 'Сохранить изменения';
  document.querySelectorAll('#tadd-type-sw .tsw').forEach(b => b.classList.toggle('on', b.dataset.tt === tmplType));
  document.getElementById('tadd-name').value = t.name;
  document.getElementById('tadd-amt').value = t.amount;
  buildAcctPicker('tadd-ap', 'ta', t.account || 'cash');
  buildCatPicker('tadd-cat', tmplType, t.category);
  buildEmoji('tadd-emoji', ALL_EMO, t.icon || null);
  openM('m-tadd');
}

function renderTemplates() {
  const grid = document.getElementById('tmpl-grid');
  document.getElementById('sc-templates').querySelector('.empty')?.remove();
  if (!S.templates.length) {
    grid.innerHTML = '';
    grid.insertAdjacentHTML('afterend', '<div class="empty" style="margin:0 22px"><span class="ei">⚡</span><p>Нет шаблонов.<br>Создай шаблон для частых операций.</p></div>');
    return;
  }
  grid.innerHTML = S.templates.map(buildTmplHTML).join('');
  bindTmplButtons(grid);
}

function renderTmplSc() {
  const matching = S.templates.filter(t => t.type === addType).slice(0, 4);
  const el = document.getElementById('add-tmpl-sc');
  if (!matching.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="fl" style="margin-bottom:8px">Из шаблона</div><div style="display:flex;gap:7px;flex-wrap:wrap">${matching.map(t => `<div class="cpill" data-tid="${t.id}" style="background:var(--p2)">${t.icon || '⚡'} ${esc(t.name)}</div>`).join('')}</div>`;
  el.querySelectorAll('.cpill').forEach(p => p.addEventListener('click', () => { closeM('m-add'); openTuseM(p.dataset.tid); }));
}

function openTuseM(tid) {
  tuseId = tid;
  const t = S.templates.find(x => x.id === tid);
  if (!t) return;
  document.getElementById('tuse-ico').textContent = t.icon || '⚡';
  document.getElementById('tuse-name').textContent = t.name;
  document.getElementById('tuse-disp').textContent = (t.type === 'income' ? '+' : '−') + fmt(t.amount) + ' €';
  document.getElementById('tuse-amt').value = t.amount;
  document.getElementById('tuse-desc').value = t.name;
  document.getElementById('tuse-date').value = today();
  document.getElementById('tuse-note').value = '';
  buildAcctPicker('tuse-ap', 'tv', t.account);
  openM('m-tuse');
  setTimeout(() => document.getElementById('tuse-amt').focus(), 300);
}

document.getElementById('tuse-amt').addEventListener('input', function() {
  const t = S.templates.find(x => x.id === tuseId);
  const v = parseFloat(this.value) || 0;
  document.getElementById('tuse-disp').textContent = (t && t.type === 'income' ? '+' : '−') + fmt(v) + ' €';
});

document.getElementById('tuse-ok').addEventListener('click', () => {
  const t = S.templates.find(x => x.id === tuseId);
  if (!t) return;
  const amount = parseFloat(document.getElementById('tuse-amt').value);
  if (!amount || amount <= 0) {
    const inp = document.getElementById('tuse-amt');
    inp.classList.add('shake'); setTimeout(() => inp.classList.remove('shake'), 400);
    toast('Введи сумму'); return;
  }
  const desc = document.getElementById('tuse-desc').value.trim() || t.name;
  const note = document.getElementById('tuse-note').value.trim();
  const date = document.getElementById('tuse-date').value || today();
  const account = getAcctPicker('tuse-ap', 'tv');
  S.transactions.push({ id: uid(), type: t.type, amount, desc, note, date, account, category: t.category, isRec: false });
  save(); closeM('m-tuse'); renderHome();
  if (curSc === 'transactions') renderTx();
  toast('⚡ ' + desc + ' добавлен');
});

function openTmplAdd() {
  editTmplId = null;
  tmplType = 'expense';
  document.getElementById('tadd-title').textContent = 'Новый шаблон';
  document.getElementById('tadd-sub').textContent = 'Сохрани частую операцию для быстрого добавления';
  document.getElementById('tadd-ok').textContent = 'Сохранить шаблон';
  document.querySelectorAll('#tadd-type-sw .tsw').forEach(b => b.classList.toggle('on', b.dataset.tt === tmplType));
  document.getElementById('tadd-name').value = '';
  document.getElementById('tadd-amt').value = '';
  buildAcctPicker('tadd-ap', 'ta', 'cash');
  buildCatPicker('tadd-cat', tmplType);
  buildEmoji('tadd-emoji');
  openM('m-tadd');
}

document.querySelectorAll('#tadd-type-sw .tsw').forEach(b => b.addEventListener('click', () => {
  tmplType = b.dataset.tt;
  document.querySelectorAll('#tadd-type-sw .tsw').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  buildCatPicker('tadd-cat', tmplType);
}));

document.getElementById('tadd-ok').addEventListener('click', () => {
  const name = document.getElementById('tadd-name').value.trim();
  const amount = parseFloat(document.getElementById('tadd-amt').value);
  if (!name || !amount) { toast('Введи название и сумму'); return; }
  const account = getAcctPicker('tadd-ap', 'ta');
  const data = { name, amount, type: tmplType, account, category: getPickedCat('tadd-cat'), icon: getEmoji('tadd-emoji') };
  if (editTmplId) {
    const t = S.templates.find(x => x.id === editTmplId);
    if (t) Object.assign(t, data);
    editTmplId = null;
    toast('✅ Шаблон обновлён');
  } else {
    S.templates.push({ id: 't' + uid(), ...data });
    toast('✅ Шаблон сохранён');
  }
  save(); closeM('m-tadd'); renderTemplates(); renderFSTemplates();
  document.getElementById('p-tmpl-cnt').textContent = S.templates.length + ' шаблонов';
});

// ══════════════════════════════════════
// PROFILE
// ══════════════════════════════════════
const ACHS = [
  { id: 'first_tx',    i: '🥇', n: 'Первая запись',      desc: 'Первый шаг к финансовой осознанности', c: () => S.transactions.length >= 1 },
  { id: 'ten_tx',      i: '💪', n: '10 операций',         desc: 'Формируется привычка', c: () => S.transactions.length >= 10 },
  { id: 'fifty_tx',    i: '🏆', n: '50 операций',         desc: 'Серьёзный трекинг', c: () => S.transactions.length >= 50 },
  { id: 'hun_tx',      i: '💎', n: '100 операций',        desc: 'Мастер учёта', c: () => S.transactions.length >= 100 },
  { id: 'first_goal',  i: '🎯', n: 'Первая цель',         desc: 'Планирование начинается здесь', c: () => S.goals.length >= 1 },
  { id: 'goal_done',   i: '🎉', n: 'Цель достигнута',     desc: 'Ты это сделал!', c: () => S.goals.some(g => g.current >= g.target) },
  { id: 'three_goals', i: '🚀', n: '3 цели',              desc: 'Многоцелевой планировщик', c: () => S.goals.length >= 3 },
  { id: 'first_tmpl',  i: '⚡', n: 'Первый шаблон',       desc: 'Экономия времени', c: () => S.templates.length >= 1 },
  { id: 'rec_user',    i: '🔁', n: 'Автоплатёж',          desc: 'Контроль над подписками', c: () => S.recurring.length >= 1 },
  { id: 'saver',       i: '💰', n: 'В плюсе',             desc: 'Доходы > расходов всего', c: () => { const i=S.transactions.filter(t=>t.type==='income').reduce((a,t)=>a+t.amount,0); const e=S.transactions.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amount,0); return i>e&&i>0; } },
  { id: 'streak7',     i: '🔥', n: 'Неделя подряд',       desc: '7 дней без пропусков', c: () => calcStreak() >= 7 },
  { id: 'streak30',    i: '⚡', n: 'Месяц без пропусков', desc: '30 дней — настоящая привычка', c: () => calcStreak() >= 30 },
];

// XP система: очки за разные действия
function calcXP() {
  let xp = 0;
  xp += S.transactions.length * 10;          // 10 XP за транзакцию
  xp += S.goals.length * 50;                  // 50 XP за цель
  xp += S.goals.filter(g => g.current >= g.target).length * 200; // 200 XP за достигнутую цель
  xp += S.templates.length * 20;              // 20 XP за шаблон
  xp += S.recurring.length * 30;              // 30 XP за автоплатёж
  const streak = calcStreak();
  xp += Math.min(streak, 30) * 15;            // до 450 XP за серию
  const earnedAchs = ACHS.filter(a => a.c()).length;
  xp += earnedAchs * 100;                     // 100 XP за каждое достижение
  return xp;
}

const LEVELS = [
  { name: '🌱 Новичок',       minXP: 0,    color: '#94A3B8' },
  { name: '📊 Следящий',      minXP: 150,  color: '#60A5FA' },
  { name: '💼 Финансист',     minXP: 500,  color: '#34D399' },
  { name: '📈 Аналитик',      minXP: 1200, color: '#F59E0B' },
  { name: '🏆 Инвестор',      minXP: 2500, color: '#F97316' },
  { name: '💎 Мастер',        minXP: 5000, color: '#8B5CF6' },
  { name: '👑 Эксперт',       minXP: 10000,color: '#E8304A' },
];

function calcLevel() {
  const xp = calcXP();
  let lvIdx = 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].minXP) { lvIdx = i; break; }
  }
  const lv = LEVELS[lvIdx];
  const next = LEVELS[lvIdx + 1];
  const pct = next ? Math.round((xp - lv.minXP) / (next.minXP - lv.minXP) * 100) : 100;
  const xpToNext = next ? next.minXP - xp : 0;
  return { name: lv.name, color: lv.color, pct, xp, xpToNext, isMax: !next, nextName: next?.name || '' };
}

function calcStreak() {
  if (!S.transactions.length) return 0;
  const dates = new Set(S.transactions.map(t => t.date));
  let streak = 0;
  const n = new Date(); n.setHours(0,0,0,0);
  for (let i = 0; i < 365; i++) {
    const d = new Date(n); d.setDate(n.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (dates.has(key)) { streak++; }
    else if (i > 0) break; // skip i=0 (today may have no tx yet)
  }
  return streak;
}

function renderProfile() {
  const p = S.profile;
  const avEl = document.getElementById('p-av');
  if (isImgAvatar(p.avatar)) {
    avEl.classList.add('has-img');
    avEl.style.backgroundImage = `url('${p.avatar}')`;
    avEl.innerHTML = '';
  } else {
    avEl.classList.remove('has-img');
    avEl.style.backgroundImage = '';
    avEl.textContent = (p.name || 'A')[0].toUpperCase();
  }
  document.getElementById('p-name').textContent = p.name;
  document.getElementById('p-email').textContent = p.email || '—';
  document.getElementById('p-joined').textContent = 'С ' + new Date(S.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const dates = S.transactions.map(t => new Date(t.date));
  document.getElementById('ps-tx').textContent = S.transactions.length;
  document.getElementById('ps-cat').textContent = S.categories.length;
  document.getElementById('ps-days').textContent = dates.length ? Math.floor((new Date() - new Date(Math.min(...dates))) / 86400000) + 1 : 0;
  document.getElementById('p-cash').textContent = fmt(acctBal('cash')) + ' €';
  document.getElementById('p-bank').textContent = fmt(acctBal('bank')) + ' €';
  // Баланс копилки скрыт — виден только после ввода PIN внутри неё
  const pPiggy = document.getElementById('p-piggy');
  if (pPiggy) pPiggy.textContent = '🔒 ••••';
  // Компактная полоска геймификации (детали — по тапу, openAchievements)
  const lv = calcLevel();
  const earnedCount = ACHS.filter(a => a.c()).length;
  const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setTxt('g-streak', calcStreak());
  setTxt('g-level', (lv.name || '').replace(/^[^\wА-Яа-яЁё]+/, '').trim() || lv.name);
  setTxt('g-ach', `${earnedCount}/${ACHS.length}`);
  // Update counters in profile list
  document.getElementById('p-tmpl-cnt').textContent = S.templates.length + ' шаблонов';
  document.getElementById('p-cats-cnt').textContent = S.categories.length + ' категорий';
}

// Детальный экран геймификации (серия, уровень, достижения) — по тапу на полоску.
function openAchievements() {
  const streak = calcStreak();
  const lv = calcLevel();
  const xp = calcXP();
  const earned = ACHS.filter(a => a.c()).length;
  const achHTML = ACHS.map(a => {
    const ok = a.c();
    return `<div class="ach" title="${esc(a.desc)}"><div class="ach-ic ${ok ? 'on' : 'off'}">${a.i}</div><div class="ach-n" style="${ok ? 'color:var(--ink2);font-weight:700' : ''}">${esc(a.n)}</div></div>`;
  }).join('');
  openSheet(`
    <div class="cdlg-t">Прогресс</div>
    <div class="ach-sheet-stats">
      <div class="ach-ss"><div class="ach-ss-v">🔥 ${streak}</div><div class="ach-ss-l">серия дней</div></div>
      <div class="ach-ss"><div class="ach-ss-v">${earned}/${ACHS.length}</div><div class="ach-ss-l">наград</div></div>
    </div>
    <div class="lev-c" style="margin:0 0 16px">
      <div class="lev-top"><div><div class="lev-t">⚡ Уровень</div><div class="lev-l" style="color:${lv.color}">${esc(lv.name)}</div></div><div class="lev-xp">${xp} XP</div></div>
      <div class="lev-bar"><div class="lev-fill" style="width:${Math.min(lv.pct, 100)}%;background:linear-gradient(90deg,${lv.color},${lv.color}99)"></div></div>
      <div class="lev-sub">${lv.isMax ? 'Максимальный уровень!' : `ещё ${lv.xpToNext} XP до «${esc(lv.nextName)}»`}</div>
    </div>
    <div class="fl" style="margin-bottom:10px">Достижения</div>
    <div class="ach-grid">${achHTML}</div>
  `);
}

// ── FULLSCREEN PANELS ─────────────────
let fsCatFilter = 'all';

function openFSPanel(type) {
  const el = document.getElementById('fsp-' + type);
  if (!el) return;
  el.style.display = 'flex';
  // Double rAF ensures display:flex is painted before transition starts
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  if (type === 'templates') renderFSTemplates();
  if (type === 'cats') renderFSCats('all');
}

function closeFSPanel(type) {
  const el = document.getElementById('fsp-' + type);
  el.classList.remove('on');
  setTimeout(() => { el.style.display = 'none'; }, 320);
}

function renderFSTemplates() {
  const grid = document.getElementById('fsp-tmpl-grid');
  if (!S.templates.length) {
    grid.innerHTML = '<div class="empty" style="padding:32px 0;grid-column:1/-1"><span class="ei">⚡</span><p>Нет шаблонов</p></div>';
    return;
  }
  grid.innerHTML = S.templates.map(buildTmplHTML).join('');
  bindTmplButtons(grid);
}

function renderFSCats(filter) {
  if (filter !== undefined) fsCatFilter = filter;
  document.querySelectorAll('#fsp-cfrow .cf').forEach(b => {
    b.classList.toggle('on', b.dataset.fct === fsCatFilter);
    b.onclick = () => renderFSCats(b.dataset.fct);
  });
  const mTxs = getMonthTxs();
  const mExp = mTxs.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const cats = fsCatFilter === 'all' ? S.categories : S.categories.filter(c => c.type === fsCatFilter || c.type === 'both');
  const list = document.getElementById('fsp-cat-list');
  list.innerHTML = cats.map(cat => buildCatHTML(cat, mTxs, mExp)).join('');
  bindCatButtons(list);
}

function openEditProf() {
  document.getElementById('prof-name').value = S.profile.name;
  buildAvatarPicker('prof-emoji', S.profile.avatar || '');
  openM('m-prof');
}
document.getElementById('prof-ok').addEventListener('click', () => {
  const name = document.getElementById('prof-name').value.trim();
  if (!name) { toast('Введи имя'); return; }
  // Email привязан к аккаунту и не меняется — сохраняем имя и аватар.
  S.profile = { ...S.profile, name, avatar: getAvatar('prof-emoji') || null };
  save(); closeM('m-prof'); renderProfile(); renderHome(); toast('✅ Профиль сохранён');
});
// Начало месяца — модалка выбора дня


// Инициализация тогглов настроек при загрузке
function initSettings() {
  S.settings = S.settings || {};
  const sets = S.settings;

  initSecurity();
  const soundTog = document.getElementById('set-sound');
  const soundRow = document.getElementById('set-sound-row');
  if (soundTog) soundTog.classList.toggle('on', !!sets.sound);
  if (soundRow && !soundRow._bound) {
    soundRow._bound = true;
    soundRow.addEventListener('click', () => {
      S.settings.sound = !S.settings.sound;
      soundTog.classList.toggle('on', S.settings.sound);
      save();
      if (S.settings.sound) playAddSound();
    });
  }
}

// Звук при добавлении транзакции
function playAddSound() {
  if (!S.settings?.sound) return;
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.setValueAtTime(440, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    o.start(); o.stop(ctx.currentTime + 0.25);
  } catch(e) {}
}

// ══════════════════════════════════════
// ADJUST ACCOUNT
// ══════════════════════════════════════
let acctTarget = 'cash';
function openAdjAcct(acct) {
  acctTarget = acct;
  document.getElementById('acct-t').textContent = acct === 'cash' ? '💵 Наличные' : '🏦 Банковский счёт';
  const cur = acctBal(acct);
  document.getElementById('acct-inp').value = cur !== 0 ? cur.toFixed(2) : '';
  openM('m-acct');
}
document.getElementById('acct-ok').addEventListener('click', () => {
  const newBal = parseFloat(document.getElementById('acct-inp').value);
  if (isNaN(newBal)) { toast('Введи сумму'); return; }
  const cur = acctBal(acctTarget);
  const diff = newBal - cur;
  if (Math.abs(diff) > 0.001) {
    // Корректируем «базовый» баланс счёта, а не создаём доход/расход —
    // иначе корректировки засоряют аналитику доходов/расходов.
    S.accounts[acctTarget] = (S.accounts[acctTarget] || 0) + diff;
  }
  save(); closeM('m-acct'); renderHome(); renderProfile(); toast('✅ Баланс обновлён');
});

// ══════════════════════════════════════
// CONFETTI
// ══════════════════════════════════════
function launchConfetti() {
  const colors = ['#E8304A', '#00B876', '#2B6FED', '#F0900A', '#8B5CF6', '#EC4899'];
  for (let i = 0; i < 30; i++) {
    const el = document.createElement('div');
    el.className = 'cf-p';
    el.style.cssText = `left:${15 + Math.random() * 70}%;top:-10px;background:${colors[Math.floor(Math.random() * colors.length)]};width:${6 + Math.random() * 8}px;height:${6 + Math.random() * 8}px;border-radius:${Math.random() > 0.5 ? '50%' : '3px'};animation-duration:${1.2 + Math.random() * 1.5}s;animation-delay:${Math.random() * 0.5}s`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
}

// ══════════════════════════════════════
// BACKUP / IMPORT
// ══════════════════════════════════════
function backupData() {
  const data = JSON.stringify(S, null, 2);
  const date = new Date().toISOString().split('T')[0];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = `vault-backup-${date}.json`;
  a.click();
  toast('🔐 Резервная копия сохранена');
}

function exportCSV() {
  if (!S.transactions.length) { toast('Нет операций для экспорта'); return; }
  const TYPE = { expense: 'Расход', income: 'Доход', transfer: 'Перевод' };
  const q = v => { const s = String(v == null ? '' : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const header = ['Дата', 'Тип', 'Сумма', 'Счёт', 'Категория', 'Описание', 'Заметка'];
  const rows = [...S.transactions].sort((a, b) => a.date < b.date ? -1 : 1).map(t => [
    t.date,
    TYPE[t.type] || t.type,
    (t.type === 'expense' ? '-' : t.type === 'income' ? '+' : '') + t.amount.toFixed(2),
    t.type === 'transfer' ? `${acctLabel(t.account)} → ${acctLabel(t.toAcct)}` : acctLabel(t.account),
    t.type === 'transfer' ? 'Банкомат' : getCat(t.category).name,
    t.desc || '',
    t.note || '',
  ].map(q).join(';'));
  // BOM, чтобы Excel правильно открыл UTF-8 с кириллицей.
  const csv = '﻿' + header.join(';') + '\n' + rows.join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `vault-операции-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  toast('📊 CSV экспортирован');
}

function restoreData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = parseState(e.target.result);
      if (!parsed) { toast('❌ Неверный формат файла'); return; }
      confirmSheet({
        title: '📂 Восстановить данные?',
        text: `${parsed.transactions.length} операций · ${parsed.goals.length} целей<br><strong style="color:var(--am)">Текущие данные будут заменены</strong>`,
        okText: 'Восстановить',
        danger: false,
        onOk: () => {
          S = parsed;
          save();
          renderHome();
          initSettings();
          toast(`✅ Восстановлено ${S.transactions.length} операций`);
        }
      });
    } catch(err) {
      toast('❌ Ошибка при чтении файла');
    }
    input.value = '';
  };
  reader.readAsText(file);
}

function clearAll() {
  confirmSheet({
    title: '🗑️ Удалить все данные?',
    text: 'Транзакции, цели, шаблоны, платежи и копилка — всё будет удалено.<br><strong style="color:var(--rd)">Это нельзя отменить.</strong>',
    okText: 'Да, удалить всё',
    danger: true,
    onOk: () => {
      S.transactions = [];
      S.goals = [];
      S.recurring = [];
      S.templates = [];
      S.notifs = [];
      S.accounts = { cash: 0, bank: 0 };
      S.debts = [];
      S.piggy = { balance: 0, history: [] };
      save();
      nav('home');
      renderHome();
      toast('🗑 Все данные удалены');
    }
  });
}




// ══════════════════════════════════════
// APP LOCK (PIN на вход в приложение)
// ══════════════════════════════════════
const PIN_KEYS = `${[1,2,3,4,5,6,7,8,9].map(n => `<button class="pin-key" type="button" data-d="${n}">${n}</button>`).join('')}<span></span><button class="pin-key" type="button" data-d="0">0</button><button class="pin-key pin-back" type="button" data-back="1">⌫</button>`;

// Универсальный ввод 4-значного PIN в нижнем листе.
function pinPadSheet({ title, sub, onSubmit }) {
  const { ov, close } = openSheet(`
    <div class="cdlg-t" style="text-align:center">${title}</div>
    ${sub ? `<div class="cdlg-s" style="text-align:center">${sub}</div>` : ''}
    <div class="pin-dots" id="pps-dots"><span></span><span></span><span></span><span></span></div>
    <div class="pin-pad" id="pps-pad">${PIN_KEYS}</div>
  `);
  let buf = '';
  const dotsWrap = ov.querySelector('#pps-dots'), dots = dotsWrap.querySelectorAll('span');
  const render = () => dots.forEach((d, i) => d.classList.toggle('on', i < buf.length));
  ov.querySelector('#pps-pad').addEventListener('click', e => {
    const k = e.target.closest('.pin-key'); if (!k) return;
    if (k.dataset.back) { buf = buf.slice(0, -1); render(); return; }
    if (buf.length >= 4) return;
    buf += k.dataset.d; render();
    if (buf.length === 4) setTimeout(() => onSubmit(buf, { close, fail: () => { dotsWrap.classList.add('shake'); setTimeout(() => dotsWrap.classList.remove('shake'), 400); buf = ''; render(); } }), 140);
  });
}

// Экран блокировки на входе (нельзя закрыть без кода).
function showAppLock() {
  const el = document.getElementById('applock');
  if (!el) return;
  const pad = document.getElementById('al-pad');
  const dots = document.getElementById('al-dots').querySelectorAll('span');
  let buf = '';
  const render = () => dots.forEach((d, i) => d.classList.toggle('on', i < buf.length));
  pad.innerHTML = PIN_KEYS;
  render();
  el.classList.add('on');
  pad.onclick = e => {
    const k = e.target.closest('.pin-key'); if (!k) return;
    if (k.dataset.back) { buf = buf.slice(0, -1); render(); return; }
    if (buf.length >= 4) return;
    buf += k.dataset.d; render();
    if (buf.length === 4) setTimeout(() => {
      if (buf === S.settings.appPin) { el.classList.remove('on'); }
      else { const dw = document.getElementById('al-dots'); dw.classList.add('shake'); setTimeout(() => dw.classList.remove('shake'), 400); buf = ''; render(); }
    }, 140);
  };
}

function initSecurity() {
  const tog = document.getElementById('set-applock');
  const row = document.getElementById('set-applock-row');
  if (tog) tog.classList.toggle('on', !!S.settings.appPin);
  if (row && !row._bound) {
    row._bound = true;
    row.addEventListener('click', () => {
      if (S.settings.appPin) {
        // Отключение — подтверждаем текущим кодом.
        pinPadSheet({ title: 'Введите код', sub: 'Чтобы отключить защиту', onSubmit: (buf, h) => {
          if (buf === S.settings.appPin) { delete S.settings.appPin; save(); h.close(); initSecurity(); toast('🔓 Код отключён'); }
          else h.fail();
        }});
      } else {
        // Установка нового кода.
        pinPadSheet({ title: 'Придумайте код', sub: '4 цифры для входа в приложение', onSubmit: (buf, h) => {
          S.settings.appPin = buf; save(); h.close(); initSecurity(); toast('🔒 Код установлен');
        }});
      }
    });
  }
}

function openPiggy() {
  if (!S.piggy) S.piggy = { balance: 0, history: [], pin: null };
  if (!S.piggy.pin) openPinPad('set');
  else openPinPad('enter');
}

// PIN-клавиатура для входа в копилку (3 цифры)
function openPinPad(mode) {
  const isSet = mode === 'set';
  const { ov, close } = openSheet(`
    <div class="cdlg-t" style="text-align:center">${isSet ? 'Придумайте PIN' : 'Введите PIN'}</div>
    <div class="cdlg-s" style="text-align:center">${isSet ? 'Код из 3 цифр для входа в копилку' : 'Код из 3 цифр'}</div>
    <div class="pin-dots" id="pin-dots"><span></span><span></span><span></span></div>
    <div class="pin-pad" id="pin-pad">
      ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="pin-key" type="button" data-d="${n}">${n}</button>`).join('')}
      <span></span>
      <button class="pin-key" type="button" data-d="0">0</button>
      <button class="pin-key pin-back" type="button" data-back="1">⌫</button>
    </div>
  `);
  let buf = '';
  const dotsWrap = ov.querySelector('#pin-dots');
  const dots = dotsWrap.querySelectorAll('span');
  const render = () => dots.forEach((d, i) => d.classList.toggle('on', i < buf.length));
  ov.querySelector('#pin-pad').addEventListener('click', e => {
    const k = e.target.closest('.pin-key');
    if (!k) return;
    if (k.dataset.back) { buf = buf.slice(0, -1); render(); return; }
    if (buf.length >= 3) return;
    buf += k.dataset.d;
    render();
    if (buf.length === 3) setTimeout(submit, 140);
  });
  function submit() {
    if (isSet) {
      S.piggy.pin = buf;
      save(); close();
      toast('🔒 PIN установлен');
      renderPiggy(); openM('m-piggy');
    } else if (buf === S.piggy.pin) {
      close();
      renderPiggy(); openM('m-piggy');
    } else {
      dotsWrap.classList.add('shake');
      setTimeout(() => dotsWrap.classList.remove('shake'), 400);
      buf = ''; render();
      toast('❌ Неверный PIN');
    }
  }
}

function renderPiggy() {
  const p = S.piggy || { balance: 0, history: [] };
  document.getElementById('piggy-bal').textContent = fmt(p.balance) + ' €';
  document.getElementById('piggy-sub').textContent = '🔒 спрятано от баланса · PIN';

  // Dot on button
  const dot = document.getElementById('piggy-dot');
  if (dot) dot.style.display = p.balance > 0 ? 'flex' : 'none';

  // History
  const hist = document.getElementById('piggy-hist');
  const lbl = document.getElementById('piggy-hist-lbl');
  if (!p.history || !p.history.length) {
    lbl.style.display = 'none';
    hist.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--ink3);font-size:13px;font-weight:500">История пуста</div>';
    return;
  }
  lbl.style.display = '';
  hist.innerHTML = [...p.history].reverse().map(h => {
    const isAdd = h.amount > 0;
    return `<div class="ph-item">
      <div class="ph-ico">${isAdd ? '💜' : '💸'}</div>
      <div class="ph-b">
        <div class="ph-desc">${esc(h.desc) || (isAdd ? 'Пополнение' : 'Снятие')}</div>
        <div class="ph-date">${dateLabel(h.date)}</div>
      </div>
      <div class="ph-amt" style="color:${isAdd ? '#8B5CF6' : '#F5F4F0'}">
        ${isAdd ? '+' : '−'}${fmt(Math.abs(h.amount))} €
      </div>
    </div>`;
  }).join('');
}

function piggyTransaction(type) {
  const isAdd = type === 'add';
  const title = isAdd ? 'Пополнить копилку' : 'Снять из копилки';
  const p = S.piggy || { balance: 0, history: [] };
  openSheet(`
    <div class="cdlg-t">${title}</div>
    <div class="amt-blk"><div class="amt-sym">€</div><input id="pgamt" class="amt-inp" type="number" inputmode="decimal" placeholder="0,00"></div>
    <div class="ff"><div class="fl">Описание</div><input id="pgdesc" class="inp" placeholder="Например: на отпуск..."></div>
    ${!isAdd && p.balance > 0 ? `<div style="font-size:12px;color:var(--ink3);font-weight:500;margin-bottom:14px">Доступно: ${fmt(p.balance)} €</div>` : ''}
    <button class="btn ${isAdd ? '' : 'btn-gh'}" onclick="confirmPiggy(${isAdd}, this)" style="margin-top:4px${isAdd ? ';background:#8B5CF6;color:#fff' : ''}">${isAdd ? '+ Пополнить' : '− Снять'}</button>
  `);
  setTimeout(() => document.getElementById('pgamt')?.focus(), 300);
}

function confirmPiggy(isAdd, btn) {
  const amt = parseFloat(document.getElementById('pgamt').value);
  const desc = document.getElementById('pgdesc').value.trim();
  if (!amt || amt <= 0) {
    document.getElementById('pgamt').style.color = 'var(--rd)';
    setTimeout(() => document.getElementById('pgamt').style.color = '', 600);
    return;
  }
  if (!S.piggy) S.piggy = { balance: 0, history: [], pin: null };
  // Копилка связана с банком: пополнение списывает с банка, снятие возвращает.
  if (isAdd) {
    if (amt > acctBal('bank')) { toast('⚠️ На банке только ' + fmt(acctBal('bank')) + ' €'); return; }
    S.piggy.balance += amt;
    S.accounts.bank = (S.accounts.bank || 0) - amt;
  } else {
    if (amt > S.piggy.balance) { toast('⚠️ В копилке только ' + fmt(S.piggy.balance) + ' €'); return; }
    S.piggy.balance -= amt;
    S.accounts.bank = (S.accounts.bank || 0) + amt;
  }
  S.piggy.balance = Math.max(0, S.piggy.balance);
  S.piggy.history.push({ amount: isAdd ? amt : -amt, desc, date: today() });
  if (S.piggy.history.length > 50) S.piggy.history = S.piggy.history.slice(-50);
  save();
  btn.closest('.cdlg-ov')?.remove();
  renderPiggy();
  renderHome();
  if (curSc === 'profile') renderProfile();
  toast(isAdd ? `🐷 +${fmt(amt)} € отложено из банка` : `🏦 −${fmt(amt)} € возвращено на банк`);
}

document.getElementById('piggy-add-btn').addEventListener('click', () => piggyTransaction('add'));
document.getElementById('piggy-take-btn').addEventListener('click', () => piggyTransaction('take'));

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════
async function appInit() {
  if (window.cloudEnabled) {
    // ── Облачный режим: БД по аккаунту — единственный источник правды ──
    // Локальное хранилище не используется; читаем legacy-данные лишь один раз
    // для миграции тех, кто пользовался приложением до перехода на облако.
    let legacy = null;
    try {
      const lsRaw = localStorage.getItem(KEY);
      if (lsRaw && lsRaw !== '{}') legacy = parseState(lsRaw);
    } catch (e) {}

    try {
      const r = await window.cloudReady; // резолвится только после входа в аккаунт
      if (r.state) {
        // В облаке уже есть данные — это источник правды.
        const parsed = parseState(r.state);
        if (parsed) S = parsed;
      } else if (legacy && (legacy.transactions.length || (legacy.debts || []).length || legacy.goals.length)) {
        // В облаке пусто, но есть старые локальные данные — мигрируем их наверх.
        S = legacy;
        toast('☁️ Данные перенесены в твой аккаунт');
      } else {
        // Совсем новый аккаунт — стартуем с чистого состояния.
        S = parseState(null) || getDefaultState();
      }

      // Автозаполнение email из аккаунта (если профильный email пустой/дефолтный).
      if (window.cloudUser?.email) {
        const cur = (S.profile?.email || '').trim();
        if (!cur || cur === 'denis@example.com') S.profile.email = window.cloudUser.email;
      }

      // Гарантируем, что строка в БД существует (первый push для нового аккаунта
      // или после миграции/автозаполнения email).
      if (!r.state || legacy || window.cloudUser?.email) save();

      // Подчищаем legacy-копию, чтобы она больше не путалась под ногами.
      try { localStorage.removeItem(KEY); } catch (e) {}
      try { indexedDB.deleteDatabase(IDB_NAME); } catch (e) {}
    } catch (e) { console.warn('[cloud] init error', e); }
  } else {
    // ── Локальный режим (облако не настроено) — как раньше: localStorage + IDB ──
    try {
      await openIDB();
      const lsRaw = localStorage.getItem(KEY);
      if (!lsRaw || lsRaw === '{}') {
        const idbRaw = await loadFromIDB();
        if (idbRaw) {
          const parsed = parseState(idbRaw);
          if (parsed && parsed.transactions.length > 0) {
            S = parsed;
            localStorage.setItem(KEY, typeof idbRaw === 'string' ? idbRaw : JSON.stringify(idbRaw));
            toast('💾 Данные восстановлены из резервной копии');
          }
        }
      } else {
        saveToIDB(lsRaw);
      }
    } catch(e) {}
  }

  initSettings();
  maybeOnboard();
  autoPostRecurring();
  renderHome();
  autoNotifs();
  initAccountSection();
  if (S.settings.appPin) showAppLock();
}

// ── Секция «Аккаунт» в профиле ──
function initAccountSection() {
  const sec = document.getElementById('acct-section');
  if (!sec) return;
  if (!window.cloudEnabled || !window.cloudUser) { sec.style.display = 'none'; return; }
  sec.style.display = '';
  const em = document.getElementById('acct-email');
  if (em) em.textContent = window.cloudUser.email || '—';
  const out = document.getElementById('acct-signout');
  if (out && !out._bound) {
    out._bound = true;
    out.addEventListener('click', () => {
      confirmSheet({
        title: 'Выйти из аккаунта?',
        text: 'Локальная копия данных будет очищена. Все записи останутся в облаке и подтянутся при следующем входе.',
        okText: 'Выйти',
        danger: true,
        onOk: () => window.cloudSignOut?.(),
      });
    });
  }

  const del = document.getElementById('acct-delete');
  if (del && !del._bound) {
    del._bound = true;
    del.addEventListener('click', () => {
      confirmSheet({
        title: 'Удалить аккаунт?',
        text: 'Аккаунт и все данные в облаке будут удалены навсегда. Это действие нельзя отменить.',
        okText: 'Удалить навсегда',
        danger: true,
        onOk: async () => {
          toast('Удаляем аккаунт...');
          const r = await window.cloudDeleteAccount?.();
          if (r !== true) toast('⚠️ ' + (r || 'Не удалось удалить аккаунт'));
        },
      });
    });
  }
}

// ══════════════════════════════════════
// ONBOARDING (первый запуск)
// ══════════════════════════════════════
function maybeOnboard() {
  S.settings = S.settings || {};
  if (S.settings.onboarded) return;
  // Если уже есть данные — это не первый запуск, тихо помечаем пройденным
  const hasData = S.transactions.length || S.goals.length || S.recurring.length || (S.debts || []).length;
  if (hasData) { S.settings.onboarded = true; save(); return; }
  showOnboarding();
}

function showOnboarding() {
  const el = document.getElementById('onboarding');
  if (!el) return;
  document.getElementById('onb-name').value = (S.profile.name && S.profile.name !== 'Денис') ? S.profile.name : '';
  const emRo = document.getElementById('onb-email-ro');
  const accEmail = (window.cloudUser?.email) || (S.profile.email && S.profile.email !== 'denis@example.com' ? S.profile.email : '');
  if (emRo) emRo.textContent = accEmail || '—';
  const emFf = document.getElementById('onb-email-ff');
  if (emFf) emFf.style.display = accEmail ? '' : 'none'; // в локальном режиме без аккаунта прячем
  buildAvatarPicker('onb-emoji', S.profile.avatar || '');
  el.classList.add('on');
  setTimeout(() => document.getElementById('onb-name').focus(), 350);
}

function finishOnboarding() {
  const name = document.getElementById('onb-name').value.trim();
  if (!name) {
    const inp = document.getElementById('onb-name');
    inp.classList.add('shake'); setTimeout(() => inp.classList.remove('shake'), 400);
    inp.focus();
    toast('Введи имя');
    return;
  }
  // Email берём из аккаунта (задаётся при регистрации), вводить вручную нельзя.
  const accEmail = (window.cloudUser?.email) || (S.profile.email && S.profile.email !== 'denis@example.com' ? S.profile.email : '');
  S.profile = { name, email: accEmail, avatar: getAvatar('onb-emoji') || null };
  S.settings.lang = 'ru';
  S.settings.currency = 'EUR';
  S.settings.onboarded = true;
  save();
  document.getElementById('onboarding').classList.remove('on');
  renderHome();
  renderProfile();
  launchConfetti();
  toast('👋 Добро пожаловать, ' + name + '!');
}

document.getElementById('onb-go').addEventListener('click', finishOnboarding);
document.getElementById('onb-name').addEventListener('keydown', e => { if (e.key === 'Enter') finishOnboarding(); });

appInit();


let debtFilter='active';
function debtPaid(d){return(d.payments||[]).reduce((a,p)=>a+p.amount,0)}
function debtRemain(d){return Math.max(0,d.amount-debtPaid(d))}
function renderDebts(){
  const debts=S.debts||[],setEl=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
  const active=debts.filter(d=>!d.done);
  const owe=active.filter(d=>d.dir==='owe').reduce((a,d)=>a+debtRemain(d),0);
  const owed=active.filter(d=>d.dir==='owed').reduce((a,d)=>a+debtRemain(d),0);
  const net=owed-owe;
  setEl('dsm-owe-val',fmt(owe)+' €');setEl('dsm-owed-val',fmt(owed)+' €');
  setEl('dh-owe-cnt',active.filter(d=>d.dir==='owe').length+' долг.');
  setEl('dh-owed-cnt',active.filter(d=>d.dir==='owed').length+' долг.');
  const netEl=document.getElementById('dh-net');
  if(netEl){netEl.textContent=(net>=0?'+':'')+fmt(net)+' €';netEl.style.color=net>0?'var(--gr)':net<0?'var(--rd)':'var(--ink)';}
  document.querySelectorAll('#debt-tabs .cf').forEach(b=>b.classList.toggle('on',b.dataset.dt===debtFilter));
  const filtered=debtFilter==='active'?debts.filter(d=>!d.done):debtFilter==='done'?debts.filter(d=>d.done):debts.filter(d=>d.dir===debtFilter&&!d.done);
  const list=document.getElementById('debt-list');if(!list)return;
  if(!filtered.length){list.innerHTML='<div class="empty"><span class="ei">🤝</span><p>Нет долгов</p></div>';return;}
  list.innerHTML=filtered.map(d=>{
    const paid=debtPaid(d),remain=debtRemain(d),pct=d.amount>0?Math.round(paid/d.amount*100):0;
    const isDone=d.done||remain<=0,clr=d.dir==='owe'?'var(--rd)':'var(--gr)';
    const hist=(d.payments||[]).slice(-3).reverse().map(p=>`<div class="dbt-hi"><span class="dbt-hi-date">${p.date}</span><span class="dbt-hi-note">${esc(p.note)||'Погашение'}</span><span class="dbt-hi-amt">+${fmt(p.amount)} €</span></div>`).join('');
    return `<div class="dbt-c"><div class="dbt-main"><div class="dbt-ava ${d.dir}">${(d.name||'?')[0].toUpperCase()}</div><div class="dbt-body"><div class="dbt-name">${esc(d.name)}</div>${d.desc?`<div class="dbt-desc">${esc(d.desc)}</div>`:''}<div class="dbt-meta"><span class="dbt-tag ${d.dir}">${d.dir==='owe'?'Я должен':'Мне должны'}</span>${isDone?'<span class="dbt-tag done">✓ Закрыт</span>':''}${d.dueDate&&!isDone?`<span class="dbt-dl ${new Date(d.dueDate)<new Date()?'overdue':''}">${d.dueDate}</span>`:''}</div></div><div class="dbt-right"><div class="dbt-amt ${d.dir}" style="color:${clr}">${fmt(remain)} €</div><div class="dbt-remain-lbl">из ${fmt(d.amount)} €</div></div></div>${!isDone?`<div class="dbt-prog-wrap"><div class="dbt-prog-row"><div class="dbt-prog-bg"><div class="dbt-prog-fill" style="width:${pct}%;background:${clr}"></div></div><div class="dbt-prog-pct">${pct}%</div></div></div>`:''}<div class="dbt-actions"><button class="dbt-act pay" onclick="openDebtPay('${d.id}')">💸 Погасить</button><button class="dbt-act edit" onclick="openDebtEdit('${d.id}')">✏️ Изменить</button><button class="dbt-act del" onclick="deleteDebt('${d.id}')">🗑️ Удалить</button></div></div>`;
  }).join('');
}
function openDebtAdd(){['dadd-name','dadd-amt','dadd-desc','dadd-date'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});const e=document.getElementById('dadd-id');if(e)e.value='';const t=document.getElementById('dadd-title');if(t)t.textContent='Новый долг';document.querySelectorAll('#dadd-dir-sw .tsw').forEach(b=>b.classList.toggle('on',b.dataset.dir==='owe'));openM('m-dadd');}
function openDebtEdit(id){const d=(S.debts||[]).find(x=>x.id===id);if(!d)return;const sv=(i,v)=>{const e=document.getElementById(i);if(e)e.value=v};const el=document.getElementById('dadd-id');if(el)el.value=id;const t=document.getElementById('dadd-title');if(t)t.textContent='Редактировать';sv('dadd-name',d.name);sv('dadd-amt',d.amount);sv('dadd-desc',d.desc||'');sv('dadd-date',d.dueDate||'');document.querySelectorAll('#dadd-dir-sw .tsw').forEach(b=>b.classList.toggle('on',b.dataset.dir===d.dir));openM('m-dadd');}
function openDebtPay(id){const d=(S.debts||[]).find(x=>x.id===id);if(!d)return;const se=(i,v)=>{const e=document.getElementById(i);if(e)e.textContent=v};const el=document.getElementById('dpay-id');if(el)el.value=id;se('dpay-name-lbl',d.name);const paid=debtPaid(d),remain=debtRemain(d);se('dpay-paid-lbl',fmt(paid)+' €');se('dpay-left-lbl',fmt(remain)+' €');const bar=document.getElementById('dpay-progress-bar');if(bar)bar.style.width=(d.amount>0?Math.round(paid/d.amount*100):0)+'%';['dpay-amt','dpay-note'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});const bf=document.getElementById('dpay-full');if(bf)bf.onclick=()=>{const e=document.getElementById('dpay-amt');if(e)e.value=remain.toFixed(2);};openM('m-dpay');}
function deleteDebt(id){
  const d=(S.debts||[]).find(x=>x.id===id);
  if(!d)return;
  confirmSheet({
    title: 'Удалить долг?',
    text: `«${esc(d.name)}» — ${fmt(d.amount)} €`,
    onOk: () => {
      const idx=(S.debts||[]).findIndex(x=>x.id===id);
      S.debts=(S.debts||[]).filter(x=>x.id!==id); save(); renderDebts();
      undoToast('🗑 Долг удалён', () => { S.debts.splice(Math.min(idx,S.debts.length),0,d); save(); renderDebts(); });
    }
  });
}
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('#debt-tabs .cf').forEach(b=>b.addEventListener('click',()=>{debtFilter=b.dataset.dt;renderDebts();}));
  document.querySelectorAll('#dadd-dir-sw .tsw').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('#dadd-dir-sw .tsw').forEach(x=>x.classList.remove('on'));b.classList.add('on');}));
  const daok=document.getElementById('dadd-ok');
  if(daok)daok.addEventListener('click',()=>{
    const name=(document.getElementById('dadd-name')||{}).value?.trim();
    const amt=parseFloat((document.getElementById('dadd-amt')||{}).value||0);
    const dir=document.querySelector('#dadd-dir-sw .tsw.on')?.dataset.dir||'owe';
    const desc=(document.getElementById('dadd-desc')||{}).value?.trim()||'';
    const due=(document.getElementById('dadd-date')||{}).value||'';
    const eid=(document.getElementById('dadd-id')||{}).value||'';
    if(!name){toast('Введи имя');return;}if(!amt||amt<=0){toast('Введи сумму');return;}
    S.debts=S.debts||[];
    if(eid){const i=S.debts.findIndex(d=>d.id===eid);if(i>=0)S.debts[i]={...S.debts[i],name,amount:amt,dir,desc,dueDate:due||null};}
    else S.debts.push({id:uid(),name,dir,amount:amt,desc,dueDate:due||null,payments:[],done:false,createdAt:today()});
    save();closeM('m-dadd');renderDebts();toast(eid?'Обновлено':'Долг добавлен');
  });
  const dpok=document.getElementById('dpay-ok');
  if(dpok)dpok.addEventListener('click',()=>{
    const eid=(document.getElementById('dpay-id')||{}).value||'';
    const amt=parseFloat((document.getElementById('dpay-amt')||{}).value||0);
    const note=(document.getElementById('dpay-note')||{}).value?.trim()||'';
    if(!amt||amt<=0){toast('Введи сумму');return;}
    const d=(S.debts||[]).find(x=>x.id===eid);if(!d)return;
    d.payments=d.payments||[];d.payments.push({amount:amt,note,date:today()});
    if(debtRemain(d)<=0){d.done=true;launchConfetti();toast('Долг закрыт! 🎉');}else toast('Платёж записан');
    save();closeM('m-dpay');renderDebts();
  });
});
