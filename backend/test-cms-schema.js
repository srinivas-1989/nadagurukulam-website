// Self-check for the CMS field-schema layer.
// Run: node backend/test-cms-schema.js
const assert = require('assert');
const { CMS_FIELD_SCHEMAS, validateCmsContent } = require('./cms-field-schemas');

// A valid payload for every block must pass.
for (const [key, schema] of Object.entries(CMS_FIELD_SCHEMAS)) {
  const good = {};
  for (const g of schema.groups) {
    if (g.repeat) {
      good[g.key] = [{}];
      for (const f of g.repeat.fields) good[g.key][0][f.key] = 'x';
    } else {
      for (const f of g.fields) good[f.key] = 'x';
    }
  }
  assert.strictEqual(validateCmsContent(schema, good), null, `${key}: full valid payload rejected`);
}

// Unknown top-level keys are rejected.
assert.match(validateCmsContent(CMS_FIELD_SCHEMAS.home, { notAField: 1 }), /notAField/);
assert.match(validateCmsContent(CMS_FIELD_SCHEMAS.home, { nope: 1 }), /nope/);

// Unknown keys inside a repeat list entry are rejected.
assert.match(
  validateCmsContent(CMS_FIELD_SCHEMAS.navigation, { header: [{ title: 'A', bogus: 1 }] }),
  /header\.bogus/
);

// A repeat list must actually be a list.
assert.match(
  validateCmsContent(CMS_FIELD_SCHEMAS.navigation, { header: 'nope' }),
  /must be a list/
);

// Fields declared in one group are not treated as foreign by sibling groups —
// this is the regression that made every legitimate key look unknown.
assert.strictEqual(
  validateCmsContent(CMS_FIELD_SCHEMAS.home, {
    heroHeading: 'a', heroTagline: 'b', heroLede: 'c',
    disciplinesHeading: 'd', footerEmail: 'e@x.com',
  }),
  null
);

// Repeat field keys must not collide with sibling plain groups.
assert.strictEqual(
  validateCmsContent(CMS_FIELD_SCHEMAS.vision, { heading: 'H', body: 'B', pillars: [{ title: 'P', image: 'i' }] }),
  null
);

console.log('CMS field schema self-check passed (' + Object.keys(CMS_FIELD_SCHEMAS).length + ' blocks).');