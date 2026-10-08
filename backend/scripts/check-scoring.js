// Run with: node scripts/check-scoring.js
const assert = require('assert');
const { calculateScores } = require('../scoring');

const sections = [
  {
    id: 's1', title: 'Character',
    questions: [
      { id: 'q1', title: 'Punctuality', field_type: 'symbolic_scale', meta_config: {} },
      { id: 'q2', title: 'Behaviour note', field_type: 'text_long', meta_config: {} },
      { id: 'q3', title: 'Practice', field_type: 'symbolic_scale', meta_config: {} }
    ]
  },
  { id: 's2', title: 'Academics', questions: [{ id: 'q4', title: 'Syllabus', field_type: 'likert_standard', meta_config: { scale_points: ['Rarely', 'Often', 'Always'] } }] }
];

// Free text must not drag the average to zero; only rated answers count.
let r = calculateScores(sections, { q1: 'Exemplary', q2: 'A long written observation.', q3: 'Strong', q4: 'Often' });
assert.strictEqual(r.section_scores.s1.average, 4.5, 's1 averages the two rated questions only');
assert.strictEqual(r.section_scores.s1.question_count, 2, 'unrated question excluded from count');
assert.strictEqual(r.grade, 'A', 'overall grade band applied');

// Unanswered rated question is excluded, not scored zero.
r = calculateScores(sections, { q1: 'Exemplary' });
assert.strictEqual(r.section_scores.s2.question_count, 0);
assert.strictEqual(r.overall_average, 5, 'only the answered rated question counts');

// Nothing rated at all => no grade, rather than a misleading C.
r = calculateScores(sections, { q2: 'Only prose here.' });
assert.strictEqual(r.grade, null);
assert.strictEqual(r.has_data, false);
assert.strictEqual(r.label, 'Not Assessed');

// Band boundaries.
assert.strictEqual(calculateScores(sections, { q1: 'Exemplary', q3: 'Exemplary' }).grade, 'O', '4.5 -> O');
assert.strictEqual(calculateScores(sections, { q1: 'Satisfactory', q3: 'Satisfactory' }).grade, 'A', '3.0 -> A (band starts at 2.55)');
assert.strictEqual(calculateScores(sections, { q1: 'Developing', q3: 'Developing' }).grade, 'B', '2.0 -> B');
assert.strictEqual(calculateScores(sections, { q1: 'N/O', q3: 'N/O' }).grade, null, 'zeros are no data');

// Choice questions score only with an explicit weight.
const weighted = [{ id: 's3', title: 'Fitness', questions: [{ id: 'q5', field_type: 'choice_single', meta_config: { choices: [{ value: 'fit', weight: 5 }, { value: 'unfit' }] } }] }];
assert.strictEqual(calculateScores(weighted, { q5: 'fit' }).overall_average, 5, 'weighted choice scores');
assert.strictEqual(calculateScores(weighted, { q5: 'unfit' }).has_data, false, 'unweighted choice is descriptive');

console.log('scoring: all checks passed');