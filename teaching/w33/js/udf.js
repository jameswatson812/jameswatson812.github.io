// T-SQL functions that SQLite lacks, registered on a sql.js database so the slides' SQL runs as taught.
// Dates are text, 'YYYY-MM-DD HH:MM:SS', as stored in the practice database; date arithmetic is in UTC,
// so no daylight-saving shift ever moves a result.

const DAY = 86400000;
const HOUR = 3600000;
const MINUTE = 60000;
const DATE_RE = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*$/;

const PARTS = {
  year: 'year', yy: 'year', yyyy: 'year',
  quarter: 'quarter', qq: 'quarter', q: 'quarter',
  month: 'month', mm: 'month', m: 'month',
  dayofyear: 'dayofyear', dy: 'dayofyear', y: 'dayofyear',
  day: 'day', dd: 'day', d: 'day',
  week: 'week', wk: 'week', ww: 'week',
  weekday: 'weekday', dw: 'weekday',
  hour: 'hour', hh: 'hour',
  minute: 'minute', mi: 'minute', n: 'minute',
  second: 'second', ss: 'second', s: 'second',
};

function datePart(p, fn) {
  const k = PARTS[String(p).toLowerCase()];
  if (!k || (fn !== 'DATEPART' && k === 'weekday')) {
    throw new Error(`${fn}: '${p}' is not a date part here; use year, quarter, month, week, day, hour, minute or second.`);
  }
  return k;
}

function parse(v, fn) {
  if (v === null || v === undefined) return null;
  const m = DATE_RE.exec(String(v));
  const [y, mo, d, h, mi, s] = m ? m.slice(1).map((x) => (x === undefined ? 0 : Number(x))) : [];
  const ms = m ? Date.UTC(y, mo - 1, d, h, mi, s) : NaN;
  const t = new Date(ms);
  if (!m || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) {
    throw new Error(`${fn} could not read '${v}' as a date. Write dates as 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS'.`);
  }
  return ms;
}

const pad = (n) => String(n).padStart(2, '0');

export function formatDate(ms) {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ` +
    `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
}

const weekNumber = (ms) => Math.floor((Math.floor(ms / DAY) + 4) / 7); // weeks start on Sunday; 1 Jan 1970 was a Thursday

/** DATEDIFF counts the boundaries of the unit crossed between a and b, as SQL Server does. */
export function datediff(part, a, b) {
  const k = datePart(part, 'DATEDIFF');
  const x = parse(a, 'DATEDIFF');
  const y = parse(b, 'DATEDIFF');
  if (x === null || y === null) return null;
  const A = new Date(x);
  const B = new Date(y);
  switch (k) {
    case 'year': return B.getUTCFullYear() - A.getUTCFullYear();
    case 'quarter': return (4 * B.getUTCFullYear() + Math.floor(B.getUTCMonth() / 3)) - (4 * A.getUTCFullYear() + Math.floor(A.getUTCMonth() / 3));
    case 'month': return (12 * B.getUTCFullYear() + B.getUTCMonth()) - (12 * A.getUTCFullYear() + A.getUTCMonth());
    case 'week': return weekNumber(y) - weekNumber(x);
    case 'day': case 'dayofyear': return Math.floor(y / DAY) - Math.floor(x / DAY);
    case 'hour': return Math.floor(y / HOUR) - Math.floor(x / HOUR);
    case 'minute': return Math.floor(y / MINUTE) - Math.floor(x / MINUTE);
    default: return Math.floor(y / 1000) - Math.floor(x / 1000);
  }
}

function addMonths(ms, n) {
  const t = new Date(ms);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // 31 January plus a month is 28 or 29 February
  return Date.UTC(y, m, Math.min(t.getUTCDate(), last), t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds());
}

/** DATEADD(part, n, d): n is truncated to a whole number, as in SQL Server. */
export function dateadd(part, n, d) {
  const k = datePart(part, 'DATEADD');
  const x = parse(d, 'DATEADD');
  if (x === null || n === null || n === undefined) return null;
  const k2 = Math.trunc(Number(n));
  if (!Number.isFinite(k2)) throw new Error(`DATEADD needs a number, not '${n}'.`);
  switch (k) {
    case 'year': return formatDate(addMonths(x, 12 * k2));
    case 'quarter': return formatDate(addMonths(x, 3 * k2));
    case 'month': return formatDate(addMonths(x, k2));
    case 'week': return formatDate(x + 7 * k2 * DAY);
    case 'day': case 'dayofyear': return formatDate(x + k2 * DAY);
    case 'hour': return formatDate(x + k2 * HOUR);
    case 'minute': return formatDate(x + k2 * MINUTE);
    default: return formatDate(x + k2 * 1000);
  }
}

export function datepart(part, d) {
  const k = datePart(part, 'DATEPART');
  const x = parse(d, 'DATEPART');
  if (x === null) return null;
  const t = new Date(x);
  const jan1 = Date.UTC(t.getUTCFullYear(), 0, 1);
  switch (k) {
    case 'year': return t.getUTCFullYear();
    case 'quarter': return Math.floor(t.getUTCMonth() / 3) + 1;
    case 'month': return t.getUTCMonth() + 1;
    case 'dayofyear': return Math.floor((x - jan1) / DAY) + 1;
    case 'day': return t.getUTCDate();
    case 'week': return weekNumber(x) - weekNumber(jan1) + 1;
    case 'weekday': return t.getUTCDay() + 1; // 1 is Sunday
    case 'hour': return t.getUTCHours();
    case 'minute': return t.getUTCMinutes();
    default: return t.getUTCSeconds();
  }
}

const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const INTEGER_RE = /^[+-]?\d+$/;

/** TRY_CAST(x AS type): NULL instead of an error when x does not convert, as in SQL Server. */
export function tryCast(x, type) {
  if (x === null || x === undefined) return null;
  const spec = String(type).toLowerCase().trim();
  const t = spec.replace(/\s*\(.*\)$/, '');
  const text = typeof x === 'string' ? x.trim() : null;
  if (['float', 'real', 'decimal', 'numeric', 'money', 'smallmoney'].includes(t)) {
    const v = text === null ? Number(x) : text === '' ? 0 : NUMBER_RE.test(text) ? Number(text) : null;
    const scale = /,\s*(\d+)\s*\)$/.exec(spec);
    return v !== null && scale ? Math.round(v * 10 ** scale[1]) / 10 ** scale[1] : v;
  }
  if (['int', 'bigint', 'smallint', 'tinyint'].includes(t)) {
    if (text === null) return Math.trunc(Number(x));
    return text === '' ? 0 : INTEGER_RE.test(text) ? Number(text) : null;
  }
  if (t === 'bit') {
    const s = String(x).toLowerCase().trim();
    return ['1', 'true'].includes(s) ? 1 : ['0', 'false'].includes(s) ? 0 : (text === null ? (Number(x) ? 1 : 0) : null);
  }
  if (['varchar', 'nvarchar', 'char', 'nchar', 'text', 'ntext'].includes(t)) return String(x);
  if (['date', 'datetime', 'datetime2', 'smalldatetime'].includes(t)) {
    try {
      const s = formatDate(parse(x, 'TRY_CAST'));
      return t === 'date' ? `${s.slice(0, 10)} 00:00:00` : s;
    } catch {
      return null;
    }
  }
  throw new Error(`TRY_CAST to ${type} is not available on the practice database.`);
}

const dateField = (fn, pick) => (d) => {
  const x = parse(d, fn);
  return x === null ? null : pick(new Date(x));
};

// sql.js passes a thrown value straight to sqlite3_result_error, which keeps only strings, so an Error's
// message would be lost. The wrapper keeps the function's length: sql.js reads the SQL arity from it.
function sqlSafe(fn) {
  const wrapped = (...args) => {
    try {
      return fn(...args);
    } catch (e) {
      throw e instanceof Error ? e.message : e;
    }
  };
  return Object.defineProperty(wrapped, 'length', { value: fn.length });
}

function aggregate(db, name, { init, step, finalize }) {
  db.create_aggregate(name, { init, step: sqlSafe(step), finalize: sqlSafe(finalize) });
}

export function registerUdfs(db, { today }) {
  const fn = (name, f) => db.create_function(name, sqlSafe(f));
  fn('getdate', () => today);
  fn('datediff', datediff);
  fn('dateadd', dateadd);
  fn('datepart', datepart);
  fn('year', dateField('YEAR', (t) => t.getUTCFullYear()));
  fn('month', dateField('MONTH', (t) => t.getUTCMonth() + 1));
  fn('day', dateField('DAY', (t) => t.getUTCDate()));
  fn('try_cast', tryCast);
  // Sample standard deviation (Welford), NULL for fewer than two values, as STDEV in SQL Server.
  aggregate(db, 'stdev', {
    init: () => ({ n: 0, mean: 0, m2: 0 }),
    step(s, x) {
      if (x === null || x === undefined) return s;
      const v = Number(x);
      if (Number.isNaN(v)) throw new Error(`STDEV needs numbers, not '${x}'.`);
      s.n += 1;
      const d = v - s.mean;
      s.mean += d / s.n;
      s.m2 += d * (v - s.mean);
      return s;
    },
    finalize: (s) => (s && s.n >= 2 ? Math.sqrt(s.m2 / (s.n - 1)) : null),
  });
  // percentile_cont(x, p): linear interpolation between the values around row 1 + p * (n - 1).
  aggregate(db, 'percentile_cont', {
    init: () => ({ xs: [], p: null }),
    step(s, x, p) {
      if (s.p === null) {
        s.p = Number(p);
        if (!(s.p >= 0 && s.p <= 1)) throw new Error('PERCENTILE_CONT needs a fraction between 0 and 1.');
      }
      if (x === null || x === undefined) return s;
      const v = Number(x);
      if (Number.isNaN(v)) throw new Error(`PERCENTILE_CONT needs numbers, not '${x}'.`);
      s.xs.push(v);
      return s;
    },
    finalize(s) {
      if (!s || !s.xs.length) return null;
      const xs = s.xs.sort((a, b) => a - b);
      const rn = 1 + s.p * (xs.length - 1);
      const lo = Math.floor(rn);
      const hi = Math.ceil(rn);
      return lo === hi ? xs[lo - 1] : (hi - rn) * xs[lo - 1] + (rn - lo) * xs[hi - 1];
    },
  });
}
