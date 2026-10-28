// Settings for the practice page. The grading service decides what counts; these only shape the page.

// The grading web app (Google Apps Script), set once it is deployed. Empty: answer checks are off.
export const ENDPOINT = 'https://script.google.com/macros/s/AKfycbyHv0CwMuCLn4nu9RDs5vzB0nQvjaAbD1YBgYyAK1Hc1iHicbp1fCZSsBlha3sM1dXxug/exec';

// GETDATE() on the practice database: its data end on this day.
export const TODAY = '2026-10-31 16:00:00';

// Sessions run 9:00 AM-12:00 PM Pacific (PST, after daylight time ends on 1 Nov). Quizzes are open
// from 10:30 AM to 12:15 PM on their session day; the grader holds the same instants.
export const SESSIONS = [
  { session: 1, date: '2026-11-03', open: '2026-11-03T10:30:00-08:00', close: '2026-11-03T12:15:00-08:00', email: '2026-11-03T12:20:00-08:00' },
  { session: 2, date: '2026-11-04', open: '2026-11-04T10:30:00-08:00', close: '2026-11-04T12:15:00-08:00', email: '2026-11-04T12:20:00-08:00' },
  { session: 3, date: '2026-11-05', open: '2026-11-05T10:30:00-08:00', close: '2026-11-05T12:15:00-08:00', email: '2026-11-05T12:20:00-08:00' },
];
