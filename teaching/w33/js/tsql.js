// T-SQL to SQLite translation for the practice database, so the SQL taught for SQL Server runs here
// unchanged apart from table and column names. What cannot be translated raises UnsupportedSql, whose
// message is written for students.

export class UnsupportedSql extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedSql';
  }
}

const VARIABLES = 'Variables such as @n are not available on the practice database: write the value into the query.';
const PARENS = 'The parentheses do not match: every ( needs a closing ).';

// ------------------------------------------------------------------ tokens
const PATTERNS = [
  ['ws', String.raw`\s+`],
  ['comment', String.raw`--[^\n]*|/\*[\s\S]*?(?:\*/|$)`],
  ['str', String.raw`[Nn]?'(?:[^']|'')*'?`],
  ['qid', String.raw`"(?:[^"]|"")*"?|\[[^\]]*\]?`],
  ['temp', String.raw`#{1,2}[\w$#@]+`],
  ['var', String.raw`@{1,2}[\w$#@]*`],
  ['num', String.raw`(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`],
  ['word', String.raw`[A-Za-z_][\w$]*`],
  ['op', String.raw`<>|!=|<=|>=|\|\||[\s\S]`],
];
const TOKEN = new RegExp(PATTERNS.map(([, p]) => `(${p})`).join('|'), 'y');

const tok = (kind, text, pos = -1) => ({ kind, text, pos, low: kind === 'word' ? text.toLowerCase() : null });
const raw = (text) => ({ kind: 'raw', text });

function tokenize(sql) {
  const out = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < sql.length) {
    const pos = TOKEN.lastIndex;
    const m = TOKEN.exec(sql);
    const kind = PATTERNS[m.slice(1).findIndex((g) => g !== undefined)][0];
    const text = m[0];
    const quotes = (q) => text.split(q).length - 1;
    if (kind === 'str' && quotes("'") % 2) throw new UnsupportedSql("A quote is not closed: every text value needs a closing '.");
    if (kind === 'qid' && (text.startsWith('[') ? !text.endsWith(']') : quotes('"') % 2)) {
      throw new UnsupportedSql('A quoted name is not closed: check its closing " or ].');
    }
    if (kind === 'comment' && text.startsWith('/*') && !text.endsWith('*/')) {
      throw new UnsupportedSql('A /* comment is not closed with */.');
    }
    out.push(tok(kind, text, pos));
  }
  return out;
}

const isWs = (it) => it.kind === 'ws' || it.kind === 'comment';
const isWord = (it, ...words) => Boolean(it) && it.kind === 'word' && words.includes(it.low);
const isOp = (it, op) => Boolean(it) && it.kind === 'op' && it.text === op;
function sigIdx(items, i) {
  while (i < items.length && isWs(items[i])) i += 1;
  return i;
}
function prevSig(items, i) {
  i -= 1;
  while (i >= 0 && isWs(items[i])) i -= 1;
  return items[i];
}
const emit = (items) => items.map((it) => (it.kind === 'group' ? `(${emit(it.items)})` : it.text)).join('');

// --------------------------------------------------------------- statements
// A GO line separates batches in SSMS; here it separates statements, like a semicolon.
function isGo(toks, i) {
  if (!isWord(toks[i], 'go')) return false;
  const before = toks[i - 1];
  if (before && !(before.kind === 'ws' && before.text.includes('\n'))) return false;
  for (let k = i + 1; k < toks.length && !(toks[k].kind === 'ws' && toks[k].text.includes('\n')); k += 1) {
    if (!isWs(toks[k])) return false;
  }
  return true;
}

function splitTokens(toks) {
  const out = [];
  let cur = [];
  let depth = 0;
  toks.forEach((t, i) => {
    if (isOp(t, '(')) depth += 1;
    if (isOp(t, ')')) depth -= 1;
    if (depth === 0 && (isOp(t, ';') || isGo(toks, i))) {
      out.push(cur);
      cur = [];
    } else {
      cur.push(t);
    }
  });
  out.push(cur);
  return out.filter((st) => st.some((t) => !isWs(t)));
}

/** The T-SQL text of each statement in a batch, split on semicolons and GO lines. */
export function splitBatch(sql) {
  return splitTokens(tokenize(sql)).map((st) => {
    const last = st[st.length - 1];
    return sql.slice(st[0].pos, last.pos + last.text.length).trim();
  });
}

// ------------------------------------------------------- token-level rewrites
const RENAMES = { newid: 'random', isnull: 'ifnull', len: 'length', sysdatetime: 'getdate' };

function rewriteTokens(toks, notes) {
  const out = [];
  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i];
    const next = toks[sigIdx(toks, i + 1)];
    if (t.kind === 'comment') {
      out.push(tok('ws', t.text.startsWith('--') ? '\n' : ' '));
    } else if (t.kind === 'str') {
      let s = /^[Nn]/.test(t.text) ? t.text.slice(1) : t.text;
      if (/^'\d{4}-\d{2}-\d{2}'$/.test(s)) s = `${s.slice(0, -1)} 00:00:00'`; // a date means midnight, as in SQL Server
      out.push(tok('str', s));
    } else if (t.kind === 'temp') {
      out.push(tok('qid', `"${t.text}"`));
    } else if (t.kind === 'var' || isWord(t, 'declare')) {
      throw new UnsupportedSql(VARIABLES);
    } else if (isWord(t, 'with') && isOp(next, '(')) {
      const j = sigIdx(toks, i + 1);
      const k = sigIdx(toks, j + 1);
      const close = sigIdx(toks, k + 1);
      if (isWord(toks[k], 'nolock') && isOp(toks[close], ')')) {
        notes.add('WITH (NOLOCK) is ignored: each browser has its own copy of the database.');
        i = close;
      } else {
        out.push(t);
      }
    } else if (t.kind === 'word' && isOp(next, '(') && RENAMES[t.low]) {
      out.push(tok('word', RENAMES[t.low]));
    } else if (isWord(t, 'current_timestamp')) {
      out.push(tok('word', 'getdate'), tok('op', '('), tok('op', ')'));
    } else {
      out.push(t);
    }
  }
  return out;
}

// IF OBJECT_ID('tempdb..#t') IS NOT NULL DROP TABLE #t  ->  DROP TABLE IF EXISTS "#t"
function ifDrop(toks) {
  const sig = [];
  toks.forEach((t, i) => { if (!isWs(t)) sig.push(i); });
  const at = (k) => toks[sig[k]];
  let k = 3;
  const shape = isWord(at(0), 'if') && isWord(at(1), 'object_id') && isOp(at(2), '(') && at(3)?.kind === 'str';
  if (shape && isOp(at(4), ',') && at(5)?.kind === 'str') k = 5;
  const tail = ['op:)', 'word:is', 'word:not', 'word:null', 'word:drop', 'word:table'];
  const ok = shape && tail.every((w, n) => {
    const t = at(k + 1 + n);
    return t && `${t.kind}:${t.kind === 'word' ? t.low : t.text}` === w;
  }) && ['temp', 'qid', 'word'].includes(at(k + 7)?.kind);
  if (!ok) {
    throw new UnsupportedSql('IF is available here only as IF OBJECT_ID(\'tempdb..#name\') IS NOT NULL DROP TABLE #name.');
  }
  const name = at(k + 7).kind === 'temp' ? `"${at(k + 7).text}"` : at(k + 7).text;
  return { sql: `DROP TABLE IF EXISTS ${name}`, rest: toks.slice(sig[k + 7] + 1) };
}

// --------------------------------------------------------------------- tree
function tree(toks) {
  const root = [];
  const stack = [root];
  for (const t of toks) {
    if (isOp(t, '(')) {
      const g = { kind: 'group', items: [] };
      stack[stack.length - 1].push(g);
      stack.push(g.items);
    } else if (isOp(t, ')')) {
      if (stack.length === 1) throw new UnsupportedSql(PARENS);
      stack.pop();
    } else {
      stack[stack.length - 1].push(t);
    }
  }
  if (stack.length !== 1) throw new UnsupportedSql(PARENS);
  return root;
}

function splitOn(items, isSep) {
  const parts = [[]];
  for (const it of items) {
    if (isSep(it)) parts.push([]);
    else parts[parts.length - 1].push(it);
  }
  return parts;
}
const splitCommas = (items) => splitOn(items, (it) => isOp(it, ','));

function splitAs(items, fn) {
  let k = -1;
  items.forEach((it, i) => { if (isWord(it, 'as')) k = i; });
  if (k < 0) throw new UnsupportedSql(`${fn} needs the form ${fn}(value AS type).`);
  return { expr: items.slice(0, k), type: emit(items.slice(k + 1)).trim() };
}

function castTo(expr, type) {
  const t = type.toLowerCase().replace(/\s+/g, '').replace(/\(.*\)$/, '');
  if (t === 'date') return raw(`(substr(${emit(expr)}, 1, 10) || ' 00:00:00')`);
  if (['datetime', 'datetime2', 'smalldatetime'].includes(t)) return raw(`(${emit(expr)})`);
  return null;
}

// DATEDIFF(day, ...), TRY_CAST(x AS t), CAST(x AS date) and CONVERT(t, x), at every depth.
function rewriteCalls(items, notes) {
  for (const it of items) if (it.kind === 'group') rewriteCalls(it.items, notes);
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    const j = sigIdx(items, i + 1);
    const g = items[j];
    if (it.kind !== 'word' || !g || g.kind !== 'group') continue;
    if (['datediff', 'dateadd', 'datepart'].includes(it.low)) {
      const k = sigIdx(g.items, 0);
      if (g.items[k]?.kind === 'word' && isOp(g.items[sigIdx(g.items, k + 1)], ',')) {
        g.items[k] = tok('str', `'${g.items[k].low}'`);
      }
    } else if (it.low === 'try_cast') {
      const { expr, type } = splitAs(g.items, 'TRY_CAST');
      g.items = [...expr, tok('op', ','), tok('ws', ' '), tok('str', `'${type.replace(/'/g, "''")}'`)];
    } else if (it.low === 'cast') {
      const { expr, type } = splitAs(g.items, 'CAST');
      const replacement = castTo(expr, type);
      if (replacement) items.splice(i, j - i + 1, replacement);
    } else if (it.low === 'convert') {
      const parts = splitCommas(g.items);
      if (parts.length < 2) throw new UnsupportedSql('CONVERT needs the form CONVERT(type, value).');
      if (parts.length > 2) notes.add('CONVERT ignores its style argument here.');
      const type = emit(parts[0]).trim();
      items.splice(i, j - i + 1, castTo(parts[1], type) ?? raw(`CAST(${emit(parts[1])} AS ${type})`));
    }
  }
}

// ------------------------------------------------------------------- scopes
function isQuery(items) {
  const it = items[sigIdx(items, 0)];
  return isWord(it, 'select', 'with') || (it?.kind === 'group' && isQuery(it.items));
}

function walk(items, notes) {
  for (const it of items) {
    if (it.kind === 'group') it.items = isQuery(it.items) ? query(it.items, notes, false) : walk(it.items, notes);
  }
  return items;
}

function query(items, notes, top) {
  walk(items, notes);
  let start = sigIdx(items, 0);
  if (isWord(items[start], 'with')) { // common table expressions: name [(columns)] AS (query), ...
    let j = sigIdx(items, start + 1);
    if (isWord(items[j], 'recursive')) j = sigIdx(items, j + 1);
    for (;;) {
      j = sigIdx(items, j + 1);
      if (items[j]?.kind === 'group') j = sigIdx(items, j + 1);
      if (!isWord(items[j], 'as') || items[sigIdx(items, j + 1)]?.kind !== 'group') {
        throw new UnsupportedSql('WITH needs the form WITH name AS (SELECT ...) SELECT ....');
      }
      j = sigIdx(items, sigIdx(items, j + 1) + 1);
      if (!isOp(items[j], ',')) break;
      j = sigIdx(items, j + 1);
    }
    start = j;
  }
  // members of UNION, INTERSECT and EXCEPT, with the operators between them
  const parts = [[]];
  for (let k = start; k < items.length; k += 1) {
    if (isWord(items[k], 'union', 'intersect', 'except')) {
      const op = [items[k]];
      const n = sigIdx(items, k + 1);
      if (isWord(items[n], 'all')) {
        op.push(...items.slice(k + 1, n + 1));
        k = n;
      }
      parts.push(op, []);
    } else {
      parts[parts.length - 1].push(items[k]);
    }
  }
  const compound = parts.length > 1;
  let into = null;
  for (let p = 0; p < parts.length; p += 2) {
    let m = parts[p];
    const only = m.filter((it) => !isWs(it));
    if (compound && only.length === 1 && only[0].kind === 'group' && isQuery(only[0].items)) {
      m = [tok('ws', ' '), ...only[0].items, tok('ws', ' ')]; // SQLite takes no parentheses around a member
    }
    if (isWord(m[sigIdx(m, 0)], 'select')) {
      const r = selectMember(m, { compound, top: top && p === 0, notes });
      m = r.items;
      into = into ?? r.into;
    }
    parts[p] = m;
  }
  const body = [...items.slice(0, start), ...parts.flat()];
  if (into) body.unshift(raw(`CREATE ${into.startsWith('"#') ? 'TEMP ' : ''}TABLE ${into} AS `));
  return body;
}

const CLAUSES = ['from', 'where', 'group', 'having', 'order'];

function clauseAt(m, word) {
  for (let k = 0; k < m.length; k += 1) {
    if (!isWord(m[k], word)) continue;
    if (word !== 'group' && word !== 'order') return k;
    if (isWord(m[sigIdx(m, k + 1)], 'by')) return k;
  }
  return -1;
}

function clauses(m) {
  const at = Object.fromEntries(CLAUSES.map((w) => [w, clauseAt(m, w)]));
  const end = (w) => {
    const after = CLAUSES.slice(CLAUSES.indexOf(w) + 1).map((x) => at[x]).filter((k) => k > at[w]);
    return after.length ? Math.min(...after) : m.length;
  };
  return { at, end };
}

// expr -> expr AS alias, keeping the item's trailing whitespace after the alias
function addAlias(item, alias) {
  let k = item.length;
  while (k > 0 && isWs(item[k - 1])) k -= 1;
  item.splice(k, 0, raw(` AS ${alias}`));
  return item;
}
const hasAlias = (item) => item.some((it) => isWord(it, 'as') || (it.kind === 'raw' && it.text.startsWith(' AS ')));

function selectMember(m, { compound, top: isTop, notes }) {
  let j = sigIdx(m, sigIdx(m, 0) + 1);
  let distinct = false;
  if (isWord(m[j], 'distinct', 'all')) {
    distinct = m[j].low === 'distinct';
    j = sigIdx(m, j + 1);
  }
  let top = null;
  if (isWord(m[j], 'top')) {
    let k = sigIdx(m, j + 1);
    const count = m[k]?.kind === 'group' ? m[k].items.filter((it) => !isWs(it)) : [m[k]];
    if (count.length !== 1 || count[0]?.kind !== 'num' || !/^\d+$/.test(count[0].text)) {
      throw new UnsupportedSql('TOP needs a whole number here, as in TOP 10 or TOP (10).');
    }
    k = sigIdx(m, k + 1);
    if (isWord(m[k], 'percent')) throw new UnsupportedSql('TOP ... PERCENT is not available on the practice database: use TOP n.');
    let ties = false;
    if (isWord(m[k], 'with') && isWord(m[sigIdx(m, k + 1)], 'ties')) {
      ties = true;
      k = sigIdx(m, sigIdx(m, k + 1) + 1);
    }
    if (compound) {
      throw new UnsupportedSql('TOP inside a UNION, INTERSECT or EXCEPT is not available here: put that SELECT in a subquery, or apply TOP to the combined result.');
    }
    m.splice(j, k - j);
    top = { n: Number(count[0].text), ties };
  }

  let into = null;
  const iInto = clauseAt(m, 'into');
  const iFrom0 = clauseAt(m, 'from');
  if (iInto >= 0 && (iFrom0 < 0 || iInto < iFrom0)) {
    if (!isTop) throw new UnsupportedSql('SELECT ... INTO works only as a statement of its own.');
    const t = sigIdx(m, iInto + 1);
    if (!['qid', 'word'].includes(m[t]?.kind)) throw new UnsupportedSql('SELECT ... INTO needs a table name, such as #cohort.');
    into = m[t].text;
    m.splice(iInto, t - iInto + 1);
  }

  let { at, end } = clauses(m);
  if (at.from >= 0) { // a DDR name: schema.Table right after FROM, JOIN or a comma in the FROM list
    for (let k = at.from + 1; k < end('from'); k += 1) {
      const t = m[k];
      const before = prevSig(m, k);
      const dot = sigIdx(m, k + 1);
      if (['word', 'qid'].includes(t.kind) && isOp(m[dot], '.') && (isWord(before, 'from', 'join') || isOp(before, ','))) {
        const name = (it) => (it?.kind === 'qid' ? it.text.slice(1, -1) : it?.text);
        throw new UnsupportedSql(`This looks like a DDR name: ${name(t)}.${name(m[sigIdx(m, dot + 1)])}. On the practice ` +
          `database, drop '${name(t)}.' and use the practice table names from the handout.`);
      }
    }
  }

  // the select list: aliases (for WITH TIES), [alias] = expr, and PERCENTILE_CONT ... OVER (...)
  const listEnd = Math.min(...['from', 'where', 'group', 'having', 'order'].map((w) => at[w]).filter((k) => k >= 0), m.length);
  const ranges = [];
  let a = j;
  for (let k = j; k <= listEnd; k += 1) {
    if (k === listEnd || isOp(m[k], ',')) {
      ranges.push([a, k]);
      a = k + 1;
    }
  }
  const aliases = {};
  const exprs = [];
  const joins = [];
  // captured before the select list changes, which moves every index after it
  const source = {
    from: at.from >= 0 ? emit(m.slice(at.from + 1, end('from'))).trim() : null,
    where: at.where >= 0 ? emit(m.slice(at.where + 1, end('where'))).trim() : null,
    grouped: at.group >= 0 || at.having >= 0,
  };
  for (let r = ranges.length - 1; r >= 0; r -= 1) {
    const [b, e] = ranges[r];
    let item = m.slice(b, e);
    const p = sigIdx(item, 0);
    const q = sigIdx(item, p + 1);
    if (['qid', 'word', 'str'].includes(item[p]?.kind) && isOp(item[q], '=') && !isWord(item[p], 'case', 'not')) {
      const alias = item[p].kind === 'str' ? `"${item[p].text.slice(1, -1)}"` : item[p].text;
      item = addAlias([...item.slice(0, p), ...item.slice(q + 1)], alias);
      aliases[alias.replace(/^["[]|["\]]$/g, '').toLowerCase()] = emit(item.slice(p).filter((it) => it.kind !== 'raw')).trim();
    } else {
      let asAt = -1;
      item.forEach((it, i) => { if (isWord(it, 'as')) asAt = i; });
      const name = item[sigIdx(item, asAt + 1)];
      if (asAt >= 0 && name) aliases[name.text.replace(/^["[]|["\]]$/g, '').toLowerCase()] = emit(item.slice(0, asAt)).trim();
    }
    const before = joins.length;
    item = percentile(item, { source, notes, joins });
    if (joins.length > before && !hasAlias(item)) addAlias(item, '"(No column name)"'); // as SSMS shows it
    exprs[r] = emit(item.filter((it) => !(it.kind === 'raw' && it.text.startsWith(' AS ')))).replace(/\s+AS\s+\S+\s*$/i, '').trim();
    m.splice(b, e - b, ...item);
  }
  if (joins.length) {
    ({ at, end } = clauses(m));
    m.splice(end('from'), 0, raw(` ${joins.join(' ')} `));
  }

  ({ at, end } = clauses(m));
  if (top && !top.ties) m.push(raw(` LIMIT ${top.n}`));
  if (top && top.ties) {
    if (at.order < 0) throw new UnsupportedSql('TOP ... WITH TIES needs an ORDER BY.');
    if (distinct) throw new UnsupportedSql('TOP ... WITH TIES together with DISTINCT is not available here: use GROUP BY instead of DISTINCT.');
    const rest = at.from >= 0 ? emit(m.slice(at.from, at.order)).trim() : '';
    const keys = splitCommas(m.slice(sigIdx(m, sigIdx(m, at.order + 1) + 1))).map((key) => {
      const sig = key.filter((it) => !isWs(it));
      const dir = isWord(sig[sig.length - 1], 'asc', 'desc') ? ` ${sig.pop().text}` : '';
      const one = sig.length === 1 ? sig[0] : null;
      if (one?.kind === 'num' && exprs[Number(one.text) - 1] && exprs[Number(one.text) - 1] !== '*') {
        return `(${exprs[Number(one.text) - 1]})${dir}`;
      }
      const alias = one && aliases[one.text.replace(/^["[]|["\]]$/g, '').toLowerCase()];
      return alias ? `(${alias})${dir}` : `${emit(sig)}${dir}`;
    });
    m.push(raw(` LIMIT (SELECT COUNT(*) FROM (SELECT RANK() OVER (ORDER BY ${keys.join(', ')}) AS __w33_rank ${rest}) ` +
      `WHERE __w33_rank <= ${top.n})`));
    notes.add('TOP ... WITH TIES runs as LIMIT with a count of the tied rows.');
  }
  return { items: m, into };
}

// PERCENTILE_CONT(p) WITHIN GROUP (ORDER BY x) OVER (PARTITION BY g, ...): SQLite has no ordered-set
// window functions, so each one becomes a grouped derived table over the same FROM and WHERE, joined back
// on the partition columns.
function percentile(item, { source, notes, joins }) {
  for (let i = 0; i < item.length; i += 1) {
    if (!isWord(item[i], 'percentile_cont')) continue;
    const k = [];
    let n = i;
    for (let s = 0; s < 6; s += 1) {
      n = sigIdx(item, n + 1);
      k.push(n);
    }
    const [pg, within, group, og, over, wg] = k.map((x) => item[x]);
    if (pg?.kind !== 'group' || !isWord(within, 'within') || !isWord(group, 'group') || og?.kind !== 'group' ||
        !isWord(over, 'over') || wg?.kind !== 'group') {
      throw new UnsupportedSql('PERCENTILE_CONT works here in the form PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x) OVER (PARTITION BY g).');
    }
    if (source.from === null || source.grouped) {
      throw new UnsupportedSql('PERCENTILE_CONT ... OVER works here only on rows without GROUP BY or HAVING: put those rows in a #temp table first.');
    }
    const order = og.items.filter((it) => !isWs(it));
    if (!isWord(order[0], 'order') || !isWord(order[1], 'by')) throw new UnsupportedSql('PERCENTILE_CONT needs WITHIN GROUP (ORDER BY x).');
    let x = order.slice(2);
    let p = emit(pg.items).trim();
    if (isWord(x[x.length - 1], 'asc', 'desc')) {
      if (x.pop().low === 'desc') {
        if (!/^(\d+\.?\d*|\.\d+)$/.test(p)) throw new UnsupportedSql('PERCENTILE_CONT with ORDER BY ... DESC needs a number such as 0.5.');
        p = String(1 - Number(p));
      }
    }
    const win = wg.items.filter((it) => !isWs(it));
    let gs = [];
    if (isWord(win[0], 'partition') && isWord(win[1], 'by')) gs = splitCommas(win.slice(2)).map((g) => emit(g).trim());
    else if (win.length) throw new UnsupportedSql('PERCENTILE_CONT ... OVER takes only PARTITION BY here.');
    const id = `__w33_m${joins.length + 1}`;
    const where = source.where === null ? '' : ` WHERE ${source.where}`;
    const keys = gs.map((g, gi) => `${g} AS __w33_g${gi + 1}, `).join('');
    const groupBy = gs.length ? ` GROUP BY ${gs.join(', ')}` : '';
    const on = gs.length ? gs.map((g, gi) => `${id}.__w33_g${gi + 1} IS ${g}`).join(' AND ') : '1';
    joins.push(`LEFT JOIN (SELECT ${keys}percentile_cont(${emit(x).trim()}, ${p}) AS __w33_v FROM ${source.from}${where}${groupBy}) AS ${id} ON ${on}`);
    item.splice(i, k[5] - i + 1, raw(`${id}.__w33_v`));
    notes.add('PERCENTILE_CONT ... OVER runs as a grouped subquery joined back to the rows.');
  }
  return item;
}

// --------------------------------------------------------------------- entry
function statement(toks, notes, out) {
  if (isWord(toks[sigIdx(toks, 0)], 'if')) {
    const { sql, rest } = ifDrop(toks);
    out.push(sql);
    if (rest.some((t) => !isWs(t))) statement(rest, notes, out);
    return;
  }
  const items = tree(rewriteTokens(toks, notes));
  rewriteCalls(items, notes);
  if (isQuery(items)) {
    out.push(emit(query(items, notes, true)).trim());
    return;
  }
  const k = items.findIndex((it) => isWord(it, 'select', 'with')); // INSERT ... SELECT, CREATE TABLE ... AS SELECT
  if (k >= 0) items.splice(k, items.length - k, ...query(items.slice(k), notes, false));
  else walk(items, notes);
  out.push(emit(items).trim());
}

/** Translate a T-SQL batch: { statements: SQLite statements, notes: what was rewritten, for the curious }. */
export function translate(sql) {
  const notes = new Set();
  const statements = [];
  for (const toks of splitTokens(tokenize(sql))) statement(toks, notes, statements);
  return { statements: statements.filter((s) => s.length), notes: [...notes] };
}
