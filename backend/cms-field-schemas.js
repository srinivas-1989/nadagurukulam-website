// ============================================================================
// PUBLIC PORTAL CMS — field schemas
// ----------------------------------------------------------------------------
// The public website is data, not code. Each block below declares its fields;
// the portal builds its editor from this list and the public site renders from
// the saved values. Renaming a heading or inserting a new field is therefore a
// data edit, not a redeploy.
//
// Group shapes:
//   { key, label, fields }              → plain fields, stored as content[key]
//   { key, label, repeat: { fields } }  → repeatable list, stored as content[key]
//     so two repeatable groups in one block can never collide on the key.
//
// Field kinds: text | textarea | richtext | image | link | email | tel | boolean
// ---------------------------------------------------------------------------
// Blocks mirror the live reference site (nadagurukulam.org).
// ---------------------------------------------------------------------------

const ITEM_FIELDS = [
  { key: 'title', label: 'Title', kind: 'text', required: true },
  { key: 'subtitle', label: 'Subtitle', kind: 'text' },
  { key: 'body', label: 'Body', kind: 'richtext' },
  { key: 'image', label: 'Image', kind: 'image' },
  { key: 'link', label: 'Link', kind: 'link' },
];

const IMG_CAPTION_FIELDS = [
  { key: 'title', label: 'Caption', kind: 'text' },
  { key: 'image', label: 'Image', kind: 'image', required: true },
  { key: 'link', label: 'Link', kind: 'link' },
];

const LEGAL_PAGE_FIELDS = [
  { key: 'title', label: 'Title', kind: 'text', required: true },
  { key: 'slug', label: 'URL slug', kind: 'text', required: true },
  { key: 'body', label: 'Content', kind: 'richtext' },
  { key: 'showInFooter', label: 'Show in footer', kind: 'boolean' },
  { key: 'published', label: 'Published', kind: 'boolean' },
];

const CMS_FIELD_SCHEMAS = {
  home: {
    label: 'Home — Hero, Disciplines, Footer',
    groups: [
      { key: 'hero', label: 'Hero', fields: [
          { key: 'heroTagline', label: 'Tagline', kind: 'text' },
          { key: 'heroHeading', label: 'Heading', kind: 'text' },
          { key: 'heroLede', label: 'Lede paragraph', kind: 'textarea' },
          { key: 'heroImage', label: 'Hero image', kind: 'image' },
          { key: 'heroCtaLabel', label: 'Button label', kind: 'text' },
          { key: 'heroCtaLink', label: 'Button link', kind: 'link' },
          { key: 'heroSecondaryLabel', label: 'Secondary button label', kind: 'text' },
          { key: 'heroSecondaryLink', label: 'Secondary button link', kind: 'link' },
        ] },
      { key: 'disciplines', label: 'Disciplines', fields: [
          { key: 'disciplinesHeading', label: 'Heading', kind: 'text' },
          { key: 'disciplinesSub', label: 'Subline', kind: 'textarea' },
          { key: 'disciplinesEmptyText', label: 'Empty-state text', kind: 'text' },
        ] },
      { key: 'events', label: 'Events strip', fields: [
          { key: 'showEvents', label: 'Show published events', kind: 'boolean' },
          { key: 'eventsHeading', label: 'Heading', kind: 'text' },
          { key: 'eventsSub', label: 'Subline', kind: 'textarea' },
        ] },
      { key: 'jobs', label: 'Careers strip', fields: [
          { key: 'showJobs', label: 'Show published jobs', kind: 'boolean' },
          { key: 'jobsHeading', label: 'Heading', kind: 'text' },
        ] },
      { key: 'enquiry', label: 'Enquiry form', fields: [
          { key: 'showEnquiryForm', label: 'Show enquiry form', kind: 'boolean' },
          { key: 'enquiryHeading', label: 'Heading', kind: 'text' },
          { key: 'enquirySub', label: 'Subline', kind: 'textarea' },
        ] },
      { key: 'footer', label: 'Footer', fields: [
          { key: 'footerLogo', label: 'Footer logo', kind: 'image' },
          { key: 'footerAddress', label: 'Address', kind: 'textarea' },
          { key: 'footerPhone', label: 'Phone', kind: 'tel' },
          { key: 'footerEmail', label: 'Email', kind: 'email' },
          { key: 'footerCopyright', label: 'Copyright line', kind: 'text' },
        ] },
    ],
  },

  navigation: {
    label: 'Navigation — header & footer links',
    groups: [
      { key: 'header', label: 'Header links', repeat: { fields: ITEM_FIELDS } },
      { key: 'footerExplore', label: 'Footer — Explore column', repeat: { fields: ITEM_FIELDS } },
      { key: 'footerQuick', label: 'Footer — Quick links column', repeat: { fields: ITEM_FIELDS } },
    ],
  },

  founder: {
    label: "Founder's Message",
    groups: [
      { key: 'founder', label: 'Message', fields: [
          { key: 'show', label: 'Show section', kind: 'boolean' },
          { key: 'heading', label: 'Heading', kind: 'text' },
          { key: 'founderName', label: 'Founder name', kind: 'text' },
          { key: 'founderRole', label: 'Role / title', kind: 'text' },
          { key: 'body', label: 'Message', kind: 'richtext' },
          { key: 'portrait', label: 'Portrait', kind: 'image' },
          { key: 'signature', label: 'Signature image', kind: 'image' },
        ] },
    ],
  },

  vision: {
    label: 'Our Vision',
    groups: [
      { key: 'vision', label: 'Vision', fields: [
          { key: 'show', label: 'Show section', kind: 'boolean' },
          { key: 'heading', label: 'Heading', kind: 'text' },
          { key: 'subheading', label: 'Subheading', kind: 'text' },
          { key: 'body', label: 'Body', kind: 'richtext' },
          { key: 'image', label: 'Image', kind: 'image' },
        ] },
      { key: 'pillars', label: 'Pillars', repeat: { fields: ITEM_FIELDS } },
    ],
  },

  about: {
    label: 'About Our Institution',
    groups: [
      { key: 'about', label: 'About', fields: [
          { key: 'show', label: 'Show section', kind: 'boolean' },
          { key: 'heading', label: 'Heading', kind: 'text' },
          { key: 'body', label: 'Body', kind: 'richtext' },
          { key: 'image', label: 'Image', kind: 'image' },
        ] },
      { key: 'highlights', label: 'Highlights', repeat: { fields: ITEM_FIELDS } },
    ],
  },

  campus: {
    label: 'Upcoming Campus',
    groups: [
      { key: 'campus', label: 'Campus', fields: [
          { key: 'show', label: 'Show section', kind: 'boolean' },
          { key: 'heading', label: 'Heading', kind: 'text' },
          { key: 'subheading', label: 'Subheading', kind: 'text' },
          { key: 'body', label: 'Body', kind: 'richtext' },
          { key: 'videoUrl', label: 'Walkthrough video URL', kind: 'link' },
          { key: 'videoPoster', label: 'Video poster image', kind: 'image' },
          { key: 'ctaLabel', label: 'Button label', kind: 'text' },
          { key: 'ctaLink', label: 'Button link', kind: 'link' },
        ] },
      { key: 'gallery', label: 'Gallery images', repeat: { fields: IMG_CAPTION_FIELDS } },
    ],
  },

  contact: {
    label: 'Contact Strip',
    groups: [
      { key: 'contact', label: 'Contact', fields: [
          { key: 'show', label: 'Show section', kind: 'boolean' },
          { key: 'heading', label: 'Heading', kind: 'text' },
          { key: 'body', label: 'Body', kind: 'textarea' },
          { key: 'ctaLabel', label: 'Button label', kind: 'text' },
          { key: 'ctaLink', label: 'Button link', kind: 'link' },
        ] },
    ],
  },

  legal: {
    label: 'Legal Pages',
    groups: [
      { key: 'pages', label: 'Pages', repeat: { fields: LEGAL_PAGE_FIELDS } },
    ],
  },
};

// Rejects anything the schema doesn't declare, so a stale client can't smuggle
// fields into a published block.
const validateCmsContent = (schema, content) => {
  const known = new Set();
  for (const g of schema.groups || []) {
    if (g.repeat) known.add(g.key);
    for (const f of (g.repeat ? g.repeat.fields : g.fields) || []) {
      known.add(g.repeat ? `${g.key}.${f.key}` : f.key);
    }
  }

  const bad = Object.keys(content).filter(k => !known.has(k));

  for (const g of schema.groups || []) {
    if (!g.repeat) continue;
    const items = content[g.key];
    if (items == null) continue;
    if (!Array.isArray(items)) return `"${g.key}" must be a list`;
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return `"${g.key}" entries must be objects`;
      for (const k of Object.keys(item)) {
        if (!g.repeat.fields.some(f => f.key === k)) bad.push(`${g.key}.${k}`);
      }
    }
  }

  return bad.length ? `Unknown field(s) for this block: ${[...new Set(bad)].join(', ')}` : null;
};

module.exports = { CMS_FIELD_SCHEMAS, validateCmsContent };