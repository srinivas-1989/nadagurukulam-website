// Dossier scoring — ported from the Dossiers App's backend/scoring.py.
//
// A dossier question is only scored when its field type carries a rating.
// Free-text, dates, attachments and rankings carry no score by design: the
// mentor's written observation is the evidence, not a number.
const SCORE_MAPPING = {
  'Exemplary': 5, 'Strong': 4, 'Satisfactory': 3,
  'Developing': 2, 'Needs Significant Guidance': 1, 'N/O': 0
};

// Field types that express an opinion about quality. Everything else scores 0
// and is excluded from the denominator, so a dossier full of free text still
// produces a grade instead of collapsing to zero.
const RATED_FIELD_TYPES = new Set(['symbolic_scale', 'likert_standard', 'choice_single']);

function letterGrade(score) {
  if (!(score > 0)) return { grade: null, label: 'Not Assessed', has_data: false };
  if (score >= 4.05) return { grade: 'O', label: 'Outstanding', has_data: true };
  if (score >= 2.55) return { grade: 'A', label: 'Very Good', has_data: true };
  if (score >= 1.05) return { grade: 'B', label: 'Satisfactory', has_data: true };
  return { grade: 'C', label: 'Needs Significant Guidance', has_data: true };
}

// Returns null when the answer carries no score, which keeps an unanswered
// question out of the denominator instead of counting as a zero.
function scoreQuestion(question, response) {
  if (response === null || response === undefined || response === '') return null;
  const meta = question.meta_config || {};
  switch (question.field_type) {
    case 'symbolic_scale':
      return SCORE_MAPPING[response] ?? null;
    case 'likert_standard':
      if (typeof response === 'number') return response;
      if (SCORE_MAPPING[response] !== undefined) return SCORE_MAPPING[response];
      return (meta.scale_points || []).indexOf(response) + 1 || null;
    case 'choice_single': {
      // A choice question scores only when its options carry an explicit
      // weight, otherwise it is descriptive and excluded.
      const choice = (meta.choices || []).find(c => c.value === response);
      return choice && choice.weight !== undefined ? Number(choice.weight) : null;
    }
    default:
      return null;
  }
}

function average(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function calculateScores(sections, responses = {}) {
  const sectionScores = {};
  let all = [];

  for (const section of sections) {
    const details = [];
    const values = [];
    for (const q of section.questions || []) {
      const value = scoreQuestion(q, responses[q.id]);
      if (value !== null) values.push(value);
      details.push({
        question_id: q.id,
        title: q.title,
        field_type: q.field_type,
        response: responses[q.id] ?? null,
        score: value,
        rating: value === null ? null : letterGrade(value).label
      });
    }
    const avg = average(values);
    sectionScores[section.id] = {
      title: section.title,
      average: avg,
      rating: letterGrade(avg).label,
      question_count: values.length,
      questions: details
    };
    all = all.concat(values);
  }

  const overall = average(all);
  return {
    section_scores: sectionScores,
    overall_average: overall,
    ...letterGrade(overall),
    details: all
  };
}

module.exports = { calculateScores, letterGrade, scoreQuestion, SCORE_MAPPING };