// The quiz panel as HTML and text, kept apart from the page wiring so it can be tested. The student
// chooses the version (nothing is chosen for them), the first answer fixes it, and answers typed in
// other questions survive every re-render.
import { esc } from './html.js';

export const PLACE = { practice: 'the practice database', ddr: 'the DDR' };

/** The version a quiz is answered from: fixed by the first answer, else the one picked, else none yet. */
export function quizVersion(session, quiz, picked) {
  return quiz.versions[String(session)] || picked[String(session)] || null;
}

export function confirmText(version) {
  return `Final answer, graded against ${PLACE[version]}. One try: click again to submit.`;
}

export const MAYBE_RECORDED = 'No reply from the grader, so your answer may have been recorded. When the ' +
  'Wi-Fi is back, click Submit again: you will see the answer that counts.';

export function answeredText(r, status) {
  const verdict = r.correct ? 'Correct' : 'Not correct';
  return status === 'already' ? `${verdict}. Your first answer counts: ${r.answer}.` : verdict;
}

/** When a quiz closes, as the page says it: "11:59 PM Pacific on Sunday, November 8". */
export function closeText(iso) {
  const d = new Date(iso);
  const tz = { timeZone: 'America/Los_Angeles' };
  const time = d.toLocaleTimeString('en-US', { ...tz, hour: 'numeric', minute: '2-digit' });
  return `${time} Pacific on ${d.toLocaleDateString('en-US', { ...tz, weekday: 'long', month: 'long', day: 'numeric' })}`;
}

/**
 * One session's quiz: version choice, questions (answered ones locked), drafts and the score. Several can
 * share the page, so each has its own radio group, named after its session.
 */
export function quizHtml({ session, questions, quiz, picked, drafts, close }) {
  const locked = quiz.versions[String(session)];
  const chosen = locked || picked[String(session)] || null;
  const done = questions.filter((q) => quiz.quiz[q.id]);
  const right = done.filter((q) => quiz.quiz[q.id].correct).length;
  const note = locked ? `This quiz is on ${PLACE[locked]}, chosen with your first answer.`
    : chosen ? `You chose ${PLACE[chosen]}. Your first answer fixes it for this quiz.`
      : 'Choose where you run your queries. Your first answer fixes it for this quiz.';
  const radios = ['practice', 'ddr'].map((v) => `<label><input type="radio" name="quiz-version-${session}" value="${v}"` +
    `${chosen === v ? ' checked' : ''}> ${PLACE[v]}</label>`).join(' ');
  const rows = questions.map((q, i) => {
    const r = quiz.quiz[q.id];
    const value = r ? r.answer : drafts[q.id] || '';
    return `<li class="item" data-id="${esc(q.id)}"><p><span class="id">Question ${i + 1}.</span> ${esc(q.prompt)}</p>` +
      `<form class="answer" data-kind="quiz"><input inputmode="numeric" autocomplete="off" aria-label="Answer to ${esc(q.id)}" ` +
      `value="${esc(value)}"${r ? ' disabled' : ''}>` +
      (r ? '' : '<button type="submit">Submit</button><button type="button" class="cancel" hidden>Cancel</button>') +
      `<span class="verdict${r ? (r.correct ? ' ok' : ' no') : ''}" role="status">${r ? answeredText(r, 'recorded') : ''}</span></form></li>`;
  }).join('');
  const score = done.length ? `Score: ${right} of ${done.length} answered correctly${done.length === questions.length ? ' (final)' : ''}` : '';
  return `<p class="meta">Session ${session} quiz${close ? `, open until ${close}` : ''}. One try per question: your first answer counts.</p>` +
    `<fieldset class="versions"${locked ? ' disabled' : ''}><legend>Answer from</legend>${radios}</fieldset>` +
    `<p class="small">${note}</p><ol class="items">${rows}</ol><p class="score">${score}</p>`;
}
