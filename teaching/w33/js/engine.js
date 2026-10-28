// The practice-database engine: runs a batch of statements on a sql.js database and returns every
// result set, like the results pane of SQL Server Management Studio. Runs in the page's worker and in
// the Node tests. Temporary tables last until reset(), as on one database connection.
import { translate } from './tsql.js';
import { registerUdfs } from './udf.js';

const HELPER = '__w33_'; // columns the translator adds; never shown

export function createEngine(SQL, bytes, { today, maxRows = Infinity } = {}) {
  let db;
  const open = () => {
    db = new SQL.Database(bytes);
    // #temp tables in memory, and a page cache that holds the whole database: with SQLite's 2 MB default a
    // GROUP BY into a #temp table took 1.7 s in the browser, against 0.05 s once nothing is re-read
    db.exec('PRAGMA temp_store = MEMORY; PRAGMA cache_size = -65536;');
    registerUdfs(db, { today });
  };
  open();

  return {
    run(tsql) {
      const t0 = performance.now();
      const out = { results: [], translated: [], notes: [], ms: 0 };
      try {
        const { statements, notes } = translate(tsql);
        out.translated = statements;
        out.notes = notes;
        for (const sql of statements) {
          for (const stmt of db.iterateStatements(sql)) {
            try {
              const names = stmt.getColumnNames();
              const keep = names.map((c, i) => (c.startsWith(HELPER) ? -1 : i)).filter((i) => i >= 0);
              const columns = keep.map((i) => names[i]);
              const rows = [];
              let rowCount = 0;
              while (stmt.step()) {
                if (rowCount < maxRows) {
                  const row = stmt.get();
                  rows.push(keep.length === names.length ? row : keep.map((i) => row[i]));
                }
                rowCount += 1;
              }
              if (columns.length) out.results.push({ columns, rows, rowCount });
            } finally {
              stmt.free();
            }
          }
        }
      } catch (e) {
        out.ms = performance.now() - t0;
        e.partial = out;
        throw e;
      }
      out.ms = performance.now() - t0;
      return out;
    },
    reset() {
      db.close();
      open();
    },
  };
}
