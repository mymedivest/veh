/**
 * Workshop2U backend (Google Apps Script bound to your sheet).
 * Setup: 1) edit INITIAL_WEBMASTER below  2) run setupCredentials() once from the editor (authorise when asked)
 *        3) Deploy > New deployment > Web app > Execute as: Me > Access: Anyone  4) paste URL into script.js and form.html
 * Roles: webmaster, manager, staff, others (viewer)
 */
const SHEET_ID = '1i5lNH0k5OpI2CnD1MW2Yv1mLqSEfrOPqQX-_EoFTy00';
const TAB = 'Summary', CRED = 'Credentials', FIRST = 7, COLS = 24;
const INITIAL_WEBMASTER = { username: 'webmaster', email: 'you@example.com', password: 'ChangeMe#2026' };


// Uses the spreadsheet this script is attached to; falls back to SHEET_ID only for a standalone script.
function ss_() {
  try { const a = SpreadsheetApp.getActiveSpreadsheet(); if (a) return a; } catch (e) {}
  return SpreadsheetApp.openById(SHEET_ID);
}

const ROLES = ['webmaster', 'manager', 'staff', 'others'];
const ADMIN = ['data', 'add', 'update', 'listUsers', 'addUser', 'setUser'];
const PERM = { webmaster: ADMIN, manager: ADMIN, staff: ['data', 'add', 'update'], others: ['data'] };
const CREATE = { webmaster: ROLES, manager: ['manager', 'staff', 'others'] };   // roles each admin may create or manage

/* ---------- entry point ---------- */
function doPost(e) {
  let out;
  try {
    const q = JSON.parse(e.postData.contents), cache = CacheService.getScriptCache();
    if (q.action === 'login') out = login_(q, cache);
    else if (q.action === 'submit') out = publicSubmit_(q, cache);
    else if (q.action === 'logout') {
      const sess = JSON.parse(cache.get('t_' + q.token) || 'null');
      if (sess) { const u = users_().find(x => x.username === sess.user); log_(sess.user, u ? u.role : '', 'Logout', 'Signed out'); cache.remove('t_' + q.token); }
      out = { ok: true };
    }
    else if (q.action === 'ver') {                   // cheap change check used by the website every few seconds
      if (!cache.get('t_' + q.token)) throw new Error('Session expired. Please sign in again.');
      out = { ok: true, ver: ver_() };
    }
    else {
      const sess = JSON.parse(cache.get('t_' + q.token) || 'null');
      const u = sess && users_().find(x => x.username === sess.user);
      if (!u || !u.active) throw new Error('Session expired. Please sign in again.');
      if (!(PERM[u.role] || []).includes(q.action)) throw new Error('Your role is not permitted to do this.');
      const a = { user: u.username, role: u.role };
      out = q.action === 'data' ? getData_()
        : q.action === 'add' ? addRow_(q.row)
        : q.action === 'update' ? updateRow_(q.row)
        : q.action === 'listUsers' ? listUsers_()
        : q.action === 'addUser' ? addUser_(a, q)
        : setUser_(a, q);
      const what = { add: 'Add work order', update: 'Edit work order', addUser: 'Add user', setUser: 'Update user' }[q.action];
      if (what) log_(a.user, a.role, what, q.row ? `${q.row.veh} / ${q.row.wo}` : `${q.username}${q.role ? ' as ' + q.role : ''}${q.password ? ' (password reset)' : ''}${typeof q.active === 'boolean' ? (q.active ? ' (enabled)' : ' (disabled)') : ''}`);
    }
  } catch (err) { out = { ok: false, error: String(err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- credentials ---------- */
const hash_ = (salt, pw) => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pw).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
const cap_ = s => s.charAt(0).toUpperCase() + s.slice(1);
const credSheet_ = () => ss_().getSheetByName(CRED);

function setupCredentials() {                       // run once from the Apps Script editor
  const ss = ss_();
  let s = ss.getSheetByName(CRED);
  if (!s) { s = ss.insertSheet(CRED); s.appendRow(['Username', 'Email', 'Salt', 'PasswordHash', 'Role', 'Active', 'Created', 'CreatedBy']); s.setFrozenRows(1); }
  if (s.getLastRow() < 2) saveUser_(s, INITIAL_WEBMASTER.username, INITIAL_WEBMASTER.email, INITIAL_WEBMASTER.password, 'webmaster', 'setup');
  s.hideSheet();
  Logger.log('Credentials tab ready. Sign in as "' + INITIAL_WEBMASTER.username + '" and change the password.');
}
function saveUser_(s, user, email, pw, role, by) {
  const salt = Utilities.getUuid();
  s.appendRow([user, email, salt, hash_(salt, pw), cap_(role), 'Yes', new Date(), by]);
}
function users_() {
  return credSheet_().getDataRange().getValues().slice(1).filter(r => r[0]).map((r, i) => ({ row: i + 2, username: String(r[0]), email: String(r[1]), salt: String(r[2]), hash: String(r[3]), role: String(r[4]).toLowerCase(), active: String(r[5]).toLowerCase() === 'yes' }));
}
function login_(q, cache) {
  const u = users_().find(x => x.username.toLowerCase() === String(q.user).trim().toLowerCase());
  if (!u || !u.active || u.hash !== hash_(u.salt, String(q.pass))) { log_(q.user, '', 'Login failed', u && !u.active ? 'Account disabled' : 'Wrong username or password'); Utilities.sleep(700); throw new Error('Wrong username or password.'); }
  const token = Utilities.getUuid();
  cache.put('t_' + token, JSON.stringify({ user: u.username }), 21600);   // 6 hours
  log_(u.username, u.role, 'Login', 'Signed in');
  return { ok: true, token, role: u.role, user: u.username };
}
function listUsers_() { return { ok: true, users: users_().map(u => ({ username: u.username, email: u.email, role: u.role, active: u.active })) }; }
function addUser_(a, q) {
  if (!(CREATE[a.role] || []).includes(q.role)) throw new Error('You cannot create that role.');
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(q.username || '')) throw new Error('Username: 3-30 letters, numbers, . _ -');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q.email || '')) throw new Error('Enter a valid email address.');
  if (String(q.password || '').length < 8) throw new Error('Password must be at least 8 characters.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (users_().some(u => u.username.toLowerCase() === q.username.toLowerCase())) throw new Error('That username already exists.');
    saveUser_(credSheet_(), q.username, q.email, q.password, q.role, a.user);
  } finally { lock.releaseLock(); }
  return { ok: true };
}
function setUser_(a, q) {
  const t = users_().find(u => u.username === q.username);
  if (!t || !(CREATE[a.role] || []).includes(t.role) || t.username === a.user) throw new Error('You cannot change this account.');
  const s = credSheet_();
  if (q.password) {
    if (String(q.password).length < 8) throw new Error('Password must be at least 8 characters.');
    const salt = Utilities.getUuid(); s.getRange(t.row, 3, 1, 2).setValues([[salt, hash_(salt, q.password)]]);
  }
  if (typeof q.active === 'boolean') s.getRange(t.row, 6).setValue(q.active ? 'Yes' : 'No');
  return { ok: true };
}

/* ---------- public form (no login, write only) ---------- */
function publicSubmit_(q, cache) {
  const key = PropertiesService.getScriptProperties().getProperty('FORM_KEY');
  if (key && q.formKey !== key) throw new Error('Form is not authorised.');
  if (q.row.website) throw new Error('Rejected.');
  const hr = 'h_' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH'), n = Number(cache.get(hr) || 0);
  if (n >= 60) throw new Error('Too many submissions this hour. Try again later.');
  cache.put(hr, String(n + 1), 3600);
  addRow_(q.row);
  log_('(public form)', '', 'Public submission', `${q.row.veh} / ${q.row.wo}`);
  return { ok: true };
}

/* ---------- change tracking (lets the website refresh within seconds of any edit) ---------- */
const bump_ = () => PropertiesService.getScriptProperties().setProperty('VER', String(Date.now()));
const ver_ = () => PropertiesService.getScriptProperties().getProperty('VER') || '0';
function onSheetChange(e) {
  try { if (e && e.range && [LOG, CRED].includes(e.range.getSheet().getName())) return; } catch (x) {}
  bump_();
}               // run by the installable triggers below
function setupTriggers() {                          // run once from the editor
  ScriptApp.getProjectTriggers().filter(t => ['onSheetChange', 'dailyAgeingAlerts'].includes(t.getHandlerFunction())).forEach(t => ScriptApp.deleteTrigger(t));
  const ss = ss_();
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('dailyAgeingAlerts').timeBased().everyDays(1).atHour(8).inTimezone('Asia/Kuala_Lumpur').create();   // about 8am MYT
  log_('(system)', '', 'Setup', 'Triggers installed (sheet changes + daily ageing alerts)');
  bump_();
}

/* ---------- Summary sheet ---------- */
const sheet_ = () => ss_().getSheetByName(TAB);
const d_ = v => { if (!v) return ''; const p = String(v).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
function lastDataRow_(s) {
  const v = s.getRange(FIRST, 1, Math.max(1, s.getMaxRows() - FIRST + 1), 2).getValues();
  let last = FIRST - 1;
  v.forEach((r, i) => { if (typeof r[0] === 'number' && String(r[1]).trim()) last = FIRST + i; });
  return last;
}
function getData_() {
  const s = sheet_(), last = lastDataRow_(s), tz = s.getParent().getSpreadsheetTimeZone();
  const ver = ver_();
  if (last < FIRST) return { ok: true, rows: [], ver };
  const rows = [];
  s.getRange(FIRST, 1, last - FIRST + 1, COLS).getValues().forEach((r, i) => {
    if (String(r[1]).trim()) rows.push(r.map(c => c instanceof Date ? Utilities.formatDate(c, tz, 'yyyy-MM-dd') : c).concat(FIRST + i));   // last item = sheet row number
  });
  return { ok: true, rows, ver };
}
function clean_(r) {                                 // stop text being treated as a formula; cap length
  const o = {};
  Object.keys(r).forEach(k => { let v = String(r[k] == null ? '' : r[k]).slice(0, 2000); if (/^[=+@-]/.test(v) && !/^-?\d/.test(v)) v = "'" + v; o[k] = v; });
  return o;
}
function writeRow_(s, n, r) {
  r = clean_(r);
  ['veh', 'ws', 'site', 'wo', 'cdate', 'cat', 'complaint'].forEach(k => { if (!r[k].trim()) throw new Error('Missing field: ' + k); });
  const loan = r.loan !== '' && isNaN(Number(r.loan)) ? r.loan : (Number(r.loan) || '');   // keeps text such as ZAR / MEDIVEST
  s.getRange(n, 2, 1, 6).setValues([[r.veh.trim(), r.ws, r.site.trim().toUpperCase(), r.wo.trim(), d_(r.cdate), d_(r.edate)]]);
  s.getRange(n, 8, 1, 3).setFormulas([[`=TODAY()-F${n}+1`, `=IF(H${n}<=30,1,"")`, `=IF(H${n}>30,1,"")`]]);   // H ageing, I <=30d, J >30d
  s.getRange(n, 11, 1, 14).setValues([[loan, r.cat, r.complaint, r.prNo, d_(r.prDate), r.status, r.mech, r.mechTel, r.panel, r.panelTel, r.rTitle, r.rNo, d_(r.rDate), r.price === '' ? '' : Number(r.price)]]);
}
function addRow_(r) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const s = sheet_(), last = lastDataRow_(s), n = last + 1;
    s.insertRowAfter(last);
    s.getRange(last, 1, 1, COLS).copyTo(s.getRange(n, 1, 1, COLS), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    s.getRange(n, 1).setValue((Number(s.getRange(last, 1).getValue()) || 0) + 1);
    writeRow_(s, n, r);
    bump_();
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function updateRow_(r) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const s = sheet_(), n = Number(r.row);
    if (!(n >= FIRST && n <= lastDataRow_(s)) || String(s.getRange(n, 2).getValue()).trim() !== String(r.orig).trim()) throw new Error('This row has changed. Refresh and try again.');
    writeRow_(s, n, r);
    bump_();
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/* ---------- recovery: run from the editor if you cannot sign in ---------- */
function resetWebmasterPassword() {                 // re-applies INITIAL_WEBMASTER (username, email, password) to the Credentials tab
  if (!credSheet_()) setupCredentials();
  const s = credSheet_(), w = INITIAL_WEBMASTER;
  const u = users_().find(x => x.username.toLowerCase() === w.username.toLowerCase());
  if (!u) saveUser_(s, w.username, w.email, w.password, 'webmaster', 'reset');
  else { const salt = Utilities.getUuid(); s.getRange(u.row, 2, 1, 5).setValues([[w.email, salt, hash_(salt, w.password), 'Webmaster', 'Yes']]); }
  Logger.log('Accounts now in Credentials tab: ' + users_().map(x => x.username + ' (' + x.role + ', ' + (x.active ? 'active' : 'disabled') + ')').join(', '));
  Logger.log('Sign in with username "' + w.username + '" and the password set in INITIAL_WEBMASTER.');
}

/* ---------- activity log (the "Log" tab) ---------- */
const LOG = 'Log';
function log_(user, role, action, details) {
  try {
    const t = v => { v = String(v == null ? '' : v).slice(0, 500); return /^[=+@-]/.test(v) ? "'" + v : v; };
    const ss = ss_(); let s = ss.getSheetByName(LOG);
    if (!s) { s = ss.insertSheet(LOG); s.appendRow(['Timestamp', 'User', 'Role', 'Action', 'Details']); s.setFrozenRows(1); s.setColumnWidth(1, 150); s.setColumnWidth(5, 380); }
    s.appendRow([new Date(), t(user), t(role), t(action), t(details)]);
  } catch (e) { /* logging must never break the app */ }
}

/* ---------- ageing e-mail alerts ---------- */
const ALERT_ROLES = ['manager'];                    // add 'webmaster' to e-mail Webmasters too
const ALERT_STEPS = { 5: 'Approaching 7 days', 7: 'Has just passed 7 days', 25: 'Approaching 30 days', 30: 'Has just passed 30 days' };
const ALERT_COLOUR = { 5: '#d98a00', 7: '#d98a00', 25: '#e5784d', 30: '#e5484d' };
function dailyAgeingAlerts() { sendAgeingAlerts_(false); }   // run by the daily trigger
function testAgeingAlerts() { sendAgeingAlerts_(true); }     // run by hand; sends again even if already sent today

function sendAgeingAlerts_(force) {
  const props = PropertiesService.getScriptProperties(), s = sheet_(), tz = ss_().getSpreadsheetTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  if (!force && props.getProperty('ALERT_DATE') === today) return;
  const last = lastDataRow_(s); if (last < FIRST) return;
  const t0 = Date.parse(today + 'T00:00:00Z'), groups = {};
  s.getRange(FIRST, 1, last - FIRST + 1, COLS).getValues().forEach(r => {
    if (!String(r[1]).trim()) return;
    const age = r[5] instanceof Date ? Math.round((t0 - Date.parse(Utilities.formatDate(r[5], tz, 'yyyy-MM-dd') + 'T00:00:00Z')) / 864e5) + 1 : Number(r[7]) || 0;   // today - complaint date + 1
    if (ALERT_STEPS[age]) (groups[age] = groups[age] || []).push({ wo: String(r[4]).replace(/\s+/g, ' ').trim(), veh: String(r[1]).trim(), ws: String(r[2]).trim(), site: String(r[3]).trim(), age });
  });
  props.setProperty('ALERT_DATE', today);
  const steps = Object.keys(groups).map(Number).sort((a, b) => a - b), total = steps.reduce((n, k) => n + groups[k].length, 0);
  if (!total) return;
  const to = users_().filter(u => u.active && ALERT_ROLES.includes(u.role) && u.email).map(u => u.email);
  if (!to.length) { log_('(system)', '', 'Ageing alert', 'No active manager e-mail address found'); return; }
  const e = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const th = 'style="text-align:left;padding:6px 10px;border-bottom:2px solid #ccd3de"', td = 'style="padding:6px 10px;border-bottom:1px solid #e2e8f0"';
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c2433"><p>These work orders reached an ageing milestone as of ${today}:</p>` +
    steps.map(k => `<h3 style="color:${ALERT_COLOUR[k]};margin:20px 0 6px">${e(ALERT_STEPS[k])} (${k} days): ${groups[k].length} work order(s)</h3>
      <table style="border-collapse:collapse;font-size:13px"><tr><th ${th}>Work Order No</th><th ${th}>Vehicle No</th><th ${th}>Workshop</th><th ${th}>Site</th><th ${th}>Ageing (days)</th></tr>` +
      groups[k].map(g => `<tr><td ${td}>${e(g.wo)}</td><td ${td}>${e(g.veh)}</td><td ${td}>${e(g.ws)}</td><td ${td}>${e(g.site)}</td><td ${td}><b>${g.age}</b></td></tr>`).join('') + '</table>').join('') +
    '<p style="color:#667085;font-size:12px;margin-top:24px">Automatic message from Workshop2U vehicle status monitoring.</p></div>';
  const text = steps.map(k => `${ALERT_STEPS[k]} (${k} days)\n` + groups[k].map(g => `  WO ${g.wo} | ${g.veh} | ${g.ws} | ${g.site} | ${g.age} days`).join('\n')).join('\n\n');
  MailApp.sendEmail({ to: to.join(','), subject: `Workshop2U ageing alert: ${total} work order(s) - ${today}`, body: text, htmlBody: html, name: 'Workshop2U' });
  log_('(system)', '', 'Ageing alert', `${total} work order(s) e-mailed to ${to.length} manager(s)`);
}
