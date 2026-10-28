// Plain-language versions of the errors a query can raise. Messages the translator writes for students
// (UnsupportedSql) pass through as they are.

const RULES = [
  [/^no such table: (.+)$/, (m) => `There is no table named ${m[1]} on the practice database. ` +
    'Check the table list for the practice names (they are on the handout too).'],
  [/^no such column: (\w+)\.(\w+)$/, (m) => `There is no column ${m[2]} in ${m[1]}. ` +
    "Check that table's columns in the table list: DDR column names are different."],
  [/^no such column: (.+)$/, (m) => `There is no column named ${m[1]} in the tables of this query. ` +
    'Check the table list: DDR column names are different.'],
  [/^near "(SELECT|WITH)": syntax error$/i, (m) => `The query could not be read near "${m[1]}". ` +
    'Two statements in a row need a semicolon (;) between them here.'],
  [/^near "(.+)": syntax error$/, (m) => `The query could not be read near "${m[1]}". Check the spelling and the commas around it.`],
  [/^incomplete input$/, () => 'The query ends too early: something is missing at the end, such as a closing parenthesis.'],
  [/^ambiguous column name: (.+)$/, (m) => `${m[1]} is in more than one of the joined tables: say which one, as in e.${m[1]}.`],
  [/^sub-select returns \d+ columns - expected 1$/, () => 'A subquery used with IN or = must return one column.'],
  [/^no such function: (.+)$/, (m) => `${m[1]} is not available on the practice database.`],
  [/^(\w+)\(\) may not be used as a window function$/, (m) => `${m[1].toUpperCase()} ... OVER (...) is not available here.`],
];

export function friendlyError(err) {
  const msg = String((err && err.message) || err);
  if (err && err.name === 'UnsupportedSql') return msg;
  for (const [re, say] of RULES) {
    const m = re.exec(msg);
    if (m) return say(m);
  }
  return `The database reported: ${msg}`;
}
