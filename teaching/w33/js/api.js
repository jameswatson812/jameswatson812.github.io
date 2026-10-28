// Client for the grading web app. It posts JSON as text/plain, which needs no CORS preflight, gives up on
// a request after 15 s and tries once more. A repeated quiz answer is safe: the grader returns the first
// recorded answer.
import { ENDPOINT } from './config.js';

export function createApi({ endpoint = ENDPOINT, fetch = globalThis.fetch, timeoutMs = 15000, retries = 1 } = {}) {
  async function once(payload) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async post(payload) {
      if (!endpoint) throw new Error('Answer checking is not set up yet.');
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          return await once(payload);
        } catch {
          // a dropped connection or a timeout: try again, then report
        }
      }
      throw new Error('Could not reach the grading service. Check the Wi-Fi and try again.');
    },
  };
}
