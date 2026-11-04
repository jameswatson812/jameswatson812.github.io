// Settings for the practice page. The grading service decides what counts; these only shape the page.

// The grading web app (Google Apps Script), set once it is deployed. Empty: answer checks are off.
export const ENDPOINT = 'https://script.google.com/macros/s/AKfycbyHv0CwMuCLn4nu9RDs5vzB0nQvjaAbD1YBgYyAK1Hc1iHicbp1fCZSsBlha3sM1dXxug/exec';

// GETDATE() on the practice database: its data end on this day.
export const TODAY = '2026-10-31 16:00:00';

// Sessions run 9:00 AM-12:00 PM Pacific (PST, after daylight time ends on 1 Nov). All three quizzes are
// open from the start of 3 November until 11:59:59 PM on Sunday 8 November; the grader holds the same
// instants, and the page shows every quiz that is open.
const OPEN = '2026-11-03T00:00:00-08:00';
const CLOSE = '2026-11-08T23:59:59-08:00';
const EMAIL = '2026-11-09T00:05:00-08:00';
export const SESSIONS = [
  { session: 1, date: '2026-11-03', open: OPEN, close: CLOSE, email: EMAIL },
  { session: 2, date: '2026-11-04', open: OPEN, close: CLOSE, email: EMAIL },
  { session: 3, date: '2026-11-05', open: OPEN, close: CLOSE, email: EMAIL },
];
