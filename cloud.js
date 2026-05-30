// ─────────────────────────────────────────────────────────────
// Vault Cloud — авторизация и синхронизация через Supabase.
//
// Контракт с app.js:
//   • window.cloudReady — Promise, резолвится { signedIn, state, cloudless? }
//   • window.cloudPushDebounced(state) — дебаунс-аплоад стейта
//   • window.cloudSignOut() — выход (перезагружает страницу)
//   • window.cloudUser — { id, email } или null
//
// Если в config.js пустые ключи — модуль выставляет cloudless=true и
// ничего не делает; приложение остаётся полностью локальным.
// ─────────────────────────────────────────────────────────────

(function () {
  const cfg = window.VAULT_CFG || {};
  const enabled = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  // Безопасные дефолты — чтобы app.js мог звать без проверок.
  window.cloudUser = null;
  window.cloudEnabled = enabled;
  window.cloudPushDebounced = () => {};
  window.cloudFlush = () => {};
  window.cloudSignOut = async () => {};
  window.cloudDeleteAccount = async () => 'Облако не настроено';
  window.openAuth = () => {};

  if (!enabled) {
    window.cloudReady = Promise.resolve({ signedIn: true, cloudless: true, state: null });
    document.addEventListener('DOMContentLoaded', () => {
      const el = document.getElementById('auth');
      if (el) el.remove();
      const acctSection = document.getElementById('acct-section');
      if (acctSection) acctSection.style.display = 'none';
    });
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[vault cloud] supabase-js не загружен; проверь CDN-скрипт в index.html');
    window.cloudReady = Promise.resolve({ signedIn: true, cloudless: true, state: null });
    return;
  }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  window.sb = sb;

  // ── Sync ───────────────────────────────────────────────────
  const TABLE = 'user_states';
  let pushTimer = null;

  async function pull() {
    if (!window.cloudUser) return null;
    try {
      const { data, error } = await sb.from(TABLE)
        .select('state, updated_at')
        .eq('user_id', window.cloudUser.id)
        .maybeSingle();
      if (error) { console.warn('[cloud] pull error', error); return null; }
      const st = data?.state;
      // Пустой объект считаем «нет данных».
      if (!st || (typeof st === 'object' && Object.keys(st).length === 0)) return null;
      return st;
    } catch (e) { console.warn('[cloud] pull throw', e); return null; }
  }

  let lastState = null;
  let dirty = false;          // есть несохранённые изменения
  let pushing = false;        // идёт запрос (защита от гонки)
  let warnedAt = 0;           // троттлинг тоста об ошибке

  // Возвращает true при успехе. При неудаче оставляет dirty=true,
  // чтобы повторить позже (при возврате сети / следующем flush).
  async function push() {
    if (!window.cloudUser || !lastState || pushing) return false;
    pushing = true;
    const snapshot = lastState;
    try {
      const { error } = await sb.from(TABLE).upsert({
        user_id: window.cloudUser.id,
        state: snapshot,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      pushing = false;
      if (error) { onPushFail(error); return false; }
      // Сбрасываем dirty только если за время запроса не появилось новых правок.
      if (lastState === snapshot) dirty = false;
      return true;
    } catch (e) {
      pushing = false;
      onPushFail(e);
      return false;
    }
  }

  function onPushFail(err) {
    console.warn('[cloud] push failed', err);
    // dirty остаётся true → повторим. Предупреждаем не чаще раза в 20 сек.
    if (Date.now() - warnedAt > 20000) {
      warnedAt = Date.now();
      window.toast?.('⚠️ Нет связи — изменения сохранятся, когда появится сеть');
    }
  }

  window.cloudPushDebounced = function (state) {
    if (!window.cloudUser) return;
    lastState = state;
    dirty = true;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 800);
  };

  // Немедленно дописать отложенную запись (уход со страницы / возврат сети).
  window.cloudFlush = function () {
    if (!dirty || !window.cloudUser || !lastState) return;
    clearTimeout(pushTimer);
    push();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') window.cloudFlush();
  });
  window.addEventListener('pagehide', () => window.cloudFlush());
  // Сеть вернулась — досылаем несохранённое.
  window.addEventListener('online', () => { warnedAt = 0; window.cloudFlush(); });

  function wipeLocal() {
    try { localStorage.removeItem('vault_v6'); } catch (e) {}
    try { indexedDB.deleteDatabase('VaultDB'); } catch (e) {}
  }

  window.cloudSignOut = async function () {
    try { await sb.auth.signOut(); } catch (e) {}
    // Чистим локальный стейт, чтобы следующий пользователь не увидел чужие данные.
    wipeLocal();
    location.reload();
  };

  // Полное удаление аккаунта. Дёргает серверную функцию delete_user()
  // (SECURITY DEFINER), которая удаляет строку из auth.users; каскад по
  // внешнему ключу заодно сносит строку в user_states. Возвращает true/строку-ошибку.
  window.cloudDeleteAccount = async function () {
    if (!window.cloudUser) return 'Нет активного аккаунта';
    try {
      // На всякий случай сначала чистим свои данные в облаке (если функции нет).
      try { await sb.from(TABLE).delete().eq('user_id', window.cloudUser.id); } catch (e) {}
      const { error } = await sb.rpc('delete_user');
      if (error) {
        console.warn('[cloud] delete_user error', error);
        return error.message || 'Не удалось удалить аккаунт';
      }
      try { await sb.auth.signOut(); } catch (e) {}
      wipeLocal();
      location.reload();
      return true;
    } catch (e) {
      console.warn('[cloud] delete account throw', e);
      return String(e?.message || e);
    }
  };

  // ── DOM helpers ────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  function setMode(mode) {
    $('auth-tab-in')?.classList.toggle('on', mode === 'in');
    $('auth-tab-up')?.classList.toggle('on', mode === 'up');
    const go = $('auth-go');
    if (go) { go.dataset.mode = mode; go.textContent = mode === 'up' ? 'Зарегистрироваться' : 'Войти'; go.disabled = false; }
    const nf = $('auth-name-ff'); if (nf) nf.style.display = mode === 'up' ? '' : 'none';
    setError('');
    setNote('');
  }
  function showAuth() { $('auth')?.classList.add('on'); }
  function hideAuth() { $('auth')?.classList.remove('on'); }
  function setBusy(b) {
    const go = $('auth-go'); if (!go) return;
    go.disabled = b;
    if (b) go.textContent = '...';
    else go.textContent = go.dataset.mode === 'up' ? 'Зарегистрироваться' : 'Войти';
  }
  function setError(msg) {
    const e = $('auth-err'); if (!e) return;
    e.textContent = msg || '';
    e.style.display = msg ? 'block' : 'none';
  }
  function setNote(msg) {
    const n = $('auth-note'); if (!n) return;
    n.textContent = msg || '';
    n.style.display = msg ? 'block' : 'none';
  }
  function translateError(err) {
    const m = (err?.message || '').toLowerCase();
    if (m.includes('invalid login')) return 'Неверный email или пароль';
    if (m.includes('already registered') || m.includes('already exists') || m.includes('user already')) return 'Такой email уже зарегистрирован — попробуй войти';
    if (m.includes('password should be at least') || m.includes('weak password')) return 'Пароль слишком короткий (минимум 6 символов)';
    if (m.includes('invalid email') || (m.includes('email') && m.includes('invalid'))) return 'Некорректный email';
    if (m.includes('email not confirmed')) return 'Подтверди email из письма, потом войди';
    if (m.includes('rate limit')) return 'Слишком много попыток, подожди минуту';
    return err?.message || 'Что-то пошло не так';
  }

  async function onSubmit() {
    const go = $('auth-go'); if (!go || go.disabled) return;
    setError(''); setNote('');
    const mode = go.dataset.mode || 'in';
    const email = $('auth-email').value.trim();
    const pass = $('auth-pass').value;
    if (!email || !pass) { setError('Заполни email и пароль'); return; }
    setBusy(true);
    try {
      if (mode === 'up') {
        const name = $('auth-name').value.trim();
        const { data, error } = await sb.auth.signUp({
          email, password: pass,
          options: { data: { name: name || null }, emailRedirectTo: location.origin + location.pathname },
        });
        if (error) throw error;
        if (!data.session) {
          // Email confirmation включён — показываем подсказку, не разлогиниваем форму.
          setNote('📧 Мы отправили письмо на ' + email + '. Подтверди адрес и возвращайся.');
          setBusy(false);
          return;
        }
        // Если сессия выдалась сразу — onAuthStateChange сам всё подхватит.
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
      }
    } catch (e) {
      setError(translateError(e));
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(''); setNote('');
    try {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname },
      });
      if (error) throw error;
      // Дальше будет редирект на Google и обратно.
    } catch (e) { setError(translateError(e)); }
  }

  window.openAuth = showAuth;

  async function onForgot() {
    const email = $('auth-email').value.trim();
    if (!email) { setError('Введи email в поле выше'); return; }
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) throw error;
      setError('');
      setNote('📧 Письмо для сброса пароля отправлено на ' + email);
    } catch (e) { setError(translateError(e)); }
  }

  // ── Boot ───────────────────────────────────────────────────
  window.cloudReady = new Promise(async (resolve) => {
    // Дожидаемся DOM, чтобы повесить обработчики на форму авторизации.
    if (document.readyState === 'loading') {
      await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
    }
    $('auth-tab-in')?.addEventListener('click', () => setMode('in'));
    $('auth-tab-up')?.addEventListener('click', () => setMode('up'));
    $('auth-go')?.addEventListener('click', onSubmit);
    $('auth-google')?.addEventListener('click', onGoogle);
    $('auth-forgot')?.addEventListener('click', (e) => { e.preventDefault(); onForgot(); });
    ['auth-email', 'auth-pass', 'auth-name'].forEach((id) => {
      $(id)?.addEventListener('keydown', (e) => { if (e.key === 'Enter') onSubmit(); });
    });
    setMode('in');

    const finish = async (session) => {
      window.cloudUser = { id: session.user.id, email: session.user.email };
      hideAuth();
      const state = await pull();
      resolve({ signedIn: true, state, cloudless: false });
    };

    const { data: { session } } = await sb.auth.getSession();
    if (session) { finish(session); return; }

    // Сессии нет — показываем экран авторизации, ждём SIGNED_IN.
    showAuth();
    let resolved = false;
    sb.auth.onAuthStateChange((event, sess) => {
      if (event === 'SIGNED_IN' && sess && !resolved) {
        resolved = true;
        finish(sess);
      }
      if (event === 'SIGNED_OUT') {
        window.cloudUser = null;
        showAuth();
      }
    });
  });
})();
