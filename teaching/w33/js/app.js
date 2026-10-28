// The W33 practice page: sign-in, the SQL workbench (tables, editor, results), exercise checks and quizzes.
import { createApi } from './api.js';
import { ENDPOINT, SESSIONS, TODAY } from './config.js';
import { decryptDatabase, normalizeUsername, unwrapKey } from './gate.js';
import { esc } from './html.js';
import { friendlyError } from './messages.js';
import { MAYBE_RECORDED, PLACE, answeredText, confirmText, quizHtml, quizVersion } from './quizview.js';

const STORE = 'w33-user';
const TIMEOUT_MS = 20000;
const MAX_ROWS = 1000;
const STOPPED = 'Stopped after 20 s. A join without a matching condition can multiply rows; check your ON clauses. ' +
  'Temporary tables were cleared.';
const STARTER = '-- Practice names: see the table list. Run with Ctrl+Enter (Cmd+Enter on a Mac).\n' +
  'SELECT TOP 10 *\nFROM EncounterFact;\n';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const onThisComputer = ['localhost', '127.0.0.1'].includes(location.hostname);
// For local testing only, ?api=<url> points the checks at a stand-in grader.
const api = createApi({ endpoint: (onThisComputer && params.get('api')) || ENDPOINT });
const WHOLE = /^\d+(\.0+)?$/; // the grader's rule, so an obvious typo is caught before it is sent

let user = null;
let dbBytes = null;
let worker = null;
let nextId = 1;
const waiting = new Map();
let running = false;
let stopMessage = STOPPED;
let items = [];
let quiz = { quiz: {}, versions: {} }; // answers the grader recorded, and each quiz's fixed version
let picked = {}; // the version chosen for each session's quiz before its first answer
let drafts = {}; // answers typed but not yet submitted, kept across re-renders

// ------------------------------------------------------------------ worker
function call(msg, transfer = []) {
  const id = nextId;
  nextId += 1;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    worker.postMessage({ ...msg, id }, transfer);
  });
}

function startWorker() {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const resolve = waiting.get(data.id);
    waiting.delete(data.id);
    if (resolve) resolve(data);
  };
  const copy = dbBytes.slice().buffer; // the page keeps its copy for the next restart
  return call({ type: 'open', bytes: copy, today: TODAY, maxRows: MAX_ROWS }, [copy]);
}

function restartWorker(message) {
  stopMessage = message;
  worker.terminate();
  for (const resolve of waiting.values()) resolve({ type: 'stopped' });
  waiting.clear();
  return startWorker();
}

// ----------------------------------------------------------------- sign-in
function setStatus(text) { $('signin-status').textContent = text; }

async function download(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(got, total);
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

async function signIn(raw) {
  const name = normalizeUsername(raw);
  const btn = $('signin-btn');
  btn.disabled = true;
  $('signin-err').textContent = '';
  try {
    if (!(window.crypto && crypto.subtle && window.DecompressionStream && window.Worker)) {
      throw new Error('This browser is too old for the practice database: use a current Chrome, Edge, Firefox or Safari.');
    }
    setStatus('Checking your username…');
    const keys = await (await fetch('data/keys.json')).json();
    const rawKey = await unwrapKey(name, keys);
    const mb = (n) => (n / 1e6).toFixed(1);
    const enc = await download('data/db.bin', (got, total) => setStatus(total
      ? `Downloading the practice database: ${mb(got)} of ${mb(total)} MB…` : `Downloading: ${mb(got)} MB…`));
    setStatus('Unlocking…');
    dbBytes = await decryptDatabase(rawKey, keys, enc);
    setStatus('Opening…');
    const opened = await startWorker();
    if (opened.type !== 'ready') throw new Error(opened.error ? opened.error.message : 'the database did not open');
    user = name;
    try { sessionStorage.setItem(STORE, name); } catch { /* private window: sign in again after a reload */ }
    await showApp();
  } catch (e) {
    setStatus('');
    $('signin-err').textContent = e.message === 'not-enrolled'
      ? 'This username is not on the class list. Use the part of your Mednet email before the @, for example jsmith. ' +
        'If it still does not work, email the instructor.'
      : `Sign-in failed: ${e.message}`;
    try { sessionStorage.removeItem(STORE); } catch { /* nothing stored */ }
  } finally {
    btn.disabled = false;
  }
}

function signOut() {
  try { sessionStorage.removeItem(STORE); } catch { /* nothing stored */ }
  if (worker) worker.terminate();
  worker = null;
  dbBytes = null;
  user = null;
  quiz = { quiz: {}, versions: {} };
  picked = {};
  drafts = {};
  $('app').hidden = true;
  $('signin').hidden = false;
  setStatus('');
  $('signin-user').value = '';
}

// --------------------------------------------------------------- workbench
async function showApp() {
  $('signin').hidden = true;
  $('app').hidden = false;
  $('who').textContent = user;
  const [schema, list] = await Promise.all([
    fetch('data/schema.json').then((r) => r.json()),
    fetch('data/items.json').then((r) => r.json()),
  ]);
  items = list;
  renderTables(schema.tables);
  const today = SESSIONS.find((s) => s.date === new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date()));
  $('ex-session').value = String(today ? today.session : 1);
  renderExercises();
  await refreshQuiz();
  $('sql').focus();
}

// Name and type share a line and the description goes below, so a column fits the narrow pane.
function renderTables(tables) {
  $('tables').innerHTML = tables.map((t) => `<details><summary>${esc(t.name)}</summary><p class="tdesc">${esc(t.desc)}</p>` +
    `<dl>${t.columns.map((c) => `<div class="col"><dt><span class="cname">${esc(c.name)}</span>` +
      `<span class="ctype">${esc(c.type)}</span></dt><dd>${esc(c.desc)}</dd></div>`).join('')}</dl></details>`).join('');
}

function editorSql() {
  const ta = $('sql');
  const picked = ta.value.slice(ta.selectionStart, ta.selectionEnd);
  return picked.trim() ? picked : ta.value; // as in SSMS: a selection runs on its own
}

function cell(v) {
  if (v === null) return '<td class="null">NULL</td>';
  if (typeof v === 'number') return `<td class="num">${esc(v)}</td>`;
  if (v instanceof Uint8Array) return `<td class="null">(${v.length} bytes)</td>`;
  return `<td>${esc(v)}</td>`;
}

function renderResults(out, error) {
  const parts = [];
  for (const r of (out && out.results) || []) {
    const shown = r.rows.length < r.rowCount ? `, showing the first ${r.rows.length.toLocaleString()}` : '';
    parts.push(`<div class="result"><p class="meta">${r.rowCount.toLocaleString()} row${r.rowCount === 1 ? '' : 's'}${shown}</p>` +
      `<div class="grid"><table><thead><tr>${r.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>` +
      `<tbody>${r.rows.map((row) => `<tr>${row.map(cell).join('')}</tr>`).join('')}</tbody></table></div></div>`);
  }
  if (error) parts.push(`<p class="sqlerr" role="alert">${esc(error)}</p>`);
  if (!parts.length) parts.push('<p class="meta">Done: the statements returned no rows.</p>');
  if (out && $('show-sql').checked && out.translated.length) {
    parts.push(`<p class="meta">Run on the practice database (SQLite) as:</p><pre class="translated">${esc(out.translated.join(';\n\n'))};</pre>`);
    if (out.notes.length) parts.push(`<ul class="notes">${out.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`);
  }
  $('results').innerHTML = parts.join('');
}

async function runQuery() {
  const sql = editorSql();
  if (!sql.trim() || running) return;
  running = true;
  $('run').disabled = true;
  $('stop').hidden = false;
  $('run-status').textContent = 'Running…';
  const t0 = performance.now();
  const timer = setTimeout(() => restartWorker(STOPPED), TIMEOUT_MS);
  const reply = await call({ type: 'run', sql });
  clearTimeout(timer);
  const secs = ((performance.now() - t0) / 1000).toFixed(2);
  if (reply.type === 'stopped') {
    renderResults(null, stopMessage);
    $('run-status').textContent = '';
  } else if (reply.type === 'error') {
    renderResults(reply.partial, friendlyError(reply.error));
    $('run-status').textContent = `${secs} s`;
    if (/out of memory/i.test(reply.error.message || '')) await restartWorker(''); // give the memory back
  } else {
    renderResults(reply.out, null);
    $('run-status').textContent = `${secs} s`;
  }
  running = false;
  $('run').disabled = false;
  $('stop').hidden = true;
}

async function resetDatabase() {
  if (running) return;
  const reply = await call({ type: 'reset' });
  $('results').innerHTML = reply.type === 'reset-done'
    ? '<p class="meta">The practice database is back to its original state; temporary tables were cleared.</p>'
    : `<p class="sqlerr">${esc(friendlyError(reply.error))}</p>`;
}

// ---------------------------------------------------------------- answers
const versionOf = (name) => document.querySelector(`input[name="${name}"]:checked`).value;

function itemRow(it, title, kind) {
  return `<li class="item" data-id="${esc(it.id)}"><p><span class="id">${esc(title)}</span> ${esc(it.prompt)}</p>` +
    `<form class="answer" data-kind="${kind}"><input inputmode="numeric" autocomplete="off" aria-label="Answer to ${esc(it.id)}">` +
    `<button type="submit">${kind === 'quiz' ? 'Submit' : 'Check'}</button>` +
    '<button type="button" class="cancel" hidden>Cancel</button>' +
    '<span class="verdict" role="status"></span></form></li>';
}

function renderExercises() {
  const s = Number($('ex-session').value);
  $('ex-list').innerHTML = items.filter((it) => it.kind === 'exercise' && it.session === s)
    .map((it) => itemRow(it, it.id, 'exercise')).join('');
}

function setVerdict(form, text, cls = '') {
  const v = form.querySelector('.verdict');
  v.textContent = text;
  v.className = `verdict ${cls}`;
}

const CHECK_ERRORS = {
  invalid: 'Enter a whole number, such as 1234.',
  'no-key': 'The DDR answers are not loaded yet: check on the practice version, or ask the instructor.',
  'unknown-item': 'This item cannot be checked.',
  version: 'Choose the practice database or the DDR first.',
};

async function check(form, id) {
  const answer = form.querySelector('input').value;
  if (!WHOLE.test(answer.replace(/[\s,]/g, ''))) return setVerdict(form, CHECK_ERRORS.invalid, 'no');
  setVerdict(form, 'Checking…');
  try {
    const r = await api.post({ action: 'check', username: user, version: versionOf('ex-version'), itemId: id, answer });
    if (r.correct === true) return setVerdict(form, 'Correct', 'ok');
    if (r.correct === false) return setVerdict(form, 'Not correct: try again', 'no');
    return setVerdict(form, CHECK_ERRORS[r.error] || (r.status === 'not-enrolled' ? 'Your username is not on the class list.' : 'Not checked: try again.'), 'no');
  } catch (e) {
    return setVerdict(form, e.message, 'no');
  }
}

function quizSession() {
  const now = Date.now();
  const live = SESSIONS.find((s) => now >= Date.parse(s.open) && now <= Date.parse(s.close));
  if (live) return live;
  return params.get('preview') === 'quiz' ? SESSIONS.find((s) => String(s.session) === (params.get('session') || '1')) : null;
}

function renderQuiz() {
  const s = quizSession();
  const box = $('quiz-body');
  if (!s) {
    box.innerHTML = '<p class="meta">Each quiz opens during the last part of its session: 10:30 AM to 12:15 PM Pacific on Tue 3, ' +
      'Wed 4 and Thu 5 November. Five questions, one try each; your score appears as you answer.</p>';
    return;
  }
  const questions = items.filter((it) => it.kind === 'quiz' && it.session === s.session);
  box.innerHTML = quizHtml({ session: s.session, questions, quiz, picked, drafts });
}

const quizForm = (id) => document.querySelector(`#quiz-body li[data-id="${CSS.escape(id)}"] form`);

async function refreshQuiz() {
  if (!quizSession()) return renderQuiz();
  try {
    const r = await api.post({ action: 'status', username: user });
    if (r.status === 'ok') quiz = { quiz: r.quiz, versions: r.versions };
  } catch {
    // shown as unanswered; submitting returns the recorded answer anyway
  }
  return renderQuiz();
}

const QUIZ_MESSAGES = {
  invalid: 'Enter a whole number, such as 1234. Nothing was recorded.',
  'not-open': 'This quiz is not open yet. Nothing was recorded.',
  closed: 'This quiz has closed. Nothing was recorded.',
  'no-key': 'The DDR answer to this question is not loaded yet. Nothing was recorded: tell the instructor.',
  'not-enrolled': 'Your username is not on the class list. Nothing was recorded.',
};

async function submitQuiz(form, id) {
  const s = quizSession();
  const version = s && quizVersion(s.session, quiz, picked);
  const input = form.querySelector('input');
  const btn = form.querySelector('button[type=submit]');
  const cancel = form.querySelector('.cancel');
  if (!version) return setVerdict(form, 'First choose above whether you answer from the DDR or the practice database.', 'no');
  if (!WHOLE.test(input.value.replace(/[\s,]/g, ''))) return setVerdict(form, QUIZ_MESSAGES.invalid, 'no');
  if (!btn.classList.contains('confirm')) { // the first click asks, naming the version; the second sends
    btn.classList.add('confirm');
    btn.textContent = 'Submit final answer';
    cancel.hidden = false;
    return setVerdict(form, confirmText(version));
  }
  input.disabled = true; // from here the answer may be recorded: it is not edited any more
  btn.disabled = true;
  cancel.hidden = true;
  setVerdict(form, 'Sending…');
  let r;
  try {
    r = await api.post({ action: 'quiz', username: user, version, itemId: id, answer: input.value });
  } catch {
    btn.disabled = false; // still confirming: one more click sends the same answer, and the grader keeps the first
    return setVerdict(form, MAYBE_RECORDED, 'no');
  }
  const key = String(s.session);
  if (r.status === 'recorded' || r.status === 'already') {
    quiz.quiz[id] = { answer: r.answer, correct: r.correct, version };
    if (!quiz.versions[key]) quiz.versions[key] = version;
    delete drafts[id];
    renderQuiz();
    const f = quizForm(id);
    return f && setVerdict(f, answeredText(r, r.status), r.correct ? 'ok' : 'no');
  }
  if (r.status === 'version-locked') {
    quiz.versions[key] = r.version;
    renderQuiz();
    const f = quizForm(id);
    return f && setVerdict(f, `This quiz is on ${PLACE[r.version]}: answer from there. Nothing was recorded.`, 'no');
  }
  input.disabled = false;
  btn.disabled = false;
  resetConfirm(form);
  return setVerdict(form, QUIZ_MESSAGES[r.status] || 'Not recorded: try again.', 'no');
}

function resetConfirm(form) {
  const btn = form.querySelector('button[type=submit]');
  btn.classList.remove('confirm');
  btn.textContent = 'Submit';
  form.querySelector('.cancel').hidden = true;
}

// ------------------------------------------------------------------ wiring
$('signin-form').addEventListener('submit', (ev) => { ev.preventDefault(); signIn($('signin-user').value); });
$('signout').addEventListener('click', signOut);
$('run').addEventListener('click', runQuery);
$('stop').addEventListener('click', () => restartWorker('Stopped. Temporary tables were cleared.'));
$('reset').addEventListener('click', resetDatabase);
$('sql').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
    ev.preventDefault();
    runQuery();
  }
});
$('ex-session').addEventListener('change', renderExercises);
for (const tab of document.querySelectorAll('.answers-tabs button')) {
  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('.answers-tabs button')) t.setAttribute('aria-selected', String(t === tab));
    $('panel-exercises').hidden = tab.dataset.panel !== 'exercises';
    $('panel-quiz').hidden = tab.dataset.panel !== 'quiz';
    if (tab.dataset.panel === 'quiz') refreshQuiz();
  });
}
document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form.answer');
  if (!form) return;
  ev.preventDefault();
  const id = form.closest('li').dataset.id;
  if (form.dataset.kind === 'quiz') submitQuiz(form, id);
  else check(form, id);
});
document.addEventListener('change', (ev) => {
  const s = quizSession();
  if (ev.target.name !== 'quiz-version' || !s) return;
  picked[String(s.session)] = ev.target.value;
  renderQuiz();
});
document.addEventListener('input', (ev) => {
  const li = ev.target.closest('#quiz-body li[data-id]');
  if (li) drafts[li.dataset.id] = ev.target.value;
});
document.addEventListener('click', (ev) => {
  if (!ev.target.classList.contains('cancel')) return;
  const form = ev.target.closest('form');
  resetConfirm(form);
  setVerdict(form, '');
});
$('sql').value = STARTER;
let saved = null;
try { saved = sessionStorage.getItem(STORE); } catch { /* storage blocked */ }
if (saved) signIn(saved);
