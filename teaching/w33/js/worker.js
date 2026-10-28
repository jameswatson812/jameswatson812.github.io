// Runs the practice database off the page's main thread. The page stops a runaway query by terminating
// this worker and starting a new one from its own copy of the database.
import { createEngine } from './engine.js';

let ready = null;
let engine = null;

// sql-wasm.js is the UMD build of sql.js; evaluated in a function it hands back initSqlJs, and the
// .wasm file it fetches sits beside it in vendor/.
async function loadSqlJs() {
  const code = await (await fetch(new URL('vendor/sql-wasm.js', import.meta.url))).text();
  const initSqlJs = new Function(`${code}\nreturn initSqlJs;`)();
  return initSqlJs({ locateFile: (file) => new URL(`vendor/${file}`, import.meta.url).href });
}

async function open({ bytes, today, maxRows }) {
  const SQL = await loadSqlJs();
  engine = createEngine(SQL, new Uint8Array(bytes), { today, maxRows });
}

self.onmessage = async ({ data }) => {
  const reply = (msg) => self.postMessage({ id: data.id, ...msg });
  try {
    if (data.type === 'open') {
      ready = open(data);
      await ready;
      reply({ type: 'ready' });
    } else if (data.type === 'run') {
      await ready; // a query sent while the database is still opening waits for it
      reply({ type: 'result', out: engine.run(data.sql) });
    } else if (data.type === 'reset') {
      await ready;
      engine.reset();
      reply({ type: 'reset-done' });
    }
  } catch (e) {
    reply({ type: 'error', error: { name: e.name, message: e.message }, partial: e.partial || null });
  }
};
