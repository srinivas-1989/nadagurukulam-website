// ============================================================================
// PUBLIC PORTAL CMS — field schemas
// ----------------------------------------------------------------------------
// The public website is data, not code. Each block below declares its fields;
// the portal renders an editor from this list and the public site renders from
// the saved values. Adding a heading, renaming a label or inserting a new field
// is therefore a data edit, not a redeploy.
//
// Field kinds: text | textarea | richtext | image | link | email | tel | number
// ---------------------------------------------------------------------------
// Reference site inventory (nadagurukulam.org) — nav, founder message, vision,
// courses, faculty, campus gallery, contact, footer columns, legal pages.
// ---------------------------------------------------------------------------

const REPEAT_BLOCKS = [
  { key: 'items', label: 'Items', min: 0, fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'subtitle', label: 'Subtitle', kind: 'text' },
      { key: 'body', label: 'Body', kind: 'richtext' },
      { key: 'image', label: 'Image', kind: 'image' },
      { key: 'link', label: 'Link', kind: 'link' },
      { key: 'linkLabel', label: 'Link label', kind: 'text' },
    ] },
];

const CMS_FIELD_SCHEMAS = {
  home: {
    label: 'Home — Hero & Disciplines',
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
          { key: 'eventsHeading', label: 'Heading', kind: 'text' },
          { key: 'eventsSub', label: 'Subline', kind: 'textarea' },
          { key: 'showEvents', label: 'Show published events', kind: 'boolean' },
        ] },
      { key: 'jobs', label: 'Careers strip', fields: [
          { key: 'jobsHeading', label: 'Heading', kind: 'text' },
          { key: 'showJobs', label: 'Show published jobs', kind: 'boolean' },
        ] },
      { key: 'enquiry', label: 'Enquiry form', fields: [
          { key: 'enquiryHeading', label: 'Heading', kind: 'text' },
          { key: 'enquirySub', label: 'Subline', kind: 'textarea' },
          { key: 'showEnquiryForm', label: 'Show enquiry form', kind: 'boolean' },
        ] },
      { key: 'footer', label: 'Footer', fields: [
          { key: 'footerAddress', label: 'Address', kind: 'textarea' },
          { key: 'footerPhone', label: 'Phone', kind: 'tel' },
          { key: 'footerEmail', label: 'Email', kind: 'email' },
          { key: 'footerLogo', label: 'Footer logo', kind: 'image' },
          { key: 'footerCopyright', label: 'Copyright line', kind: 'text' },
        ] },
    ],
  },

  // ── Navigation ────────────────────────────────────────────────────────────
  navigation: {
    label: 'Navigation',
    groups: [
      { key: 'header', label: 'Header links', repeat: REPEAT_BLOCKS[0] },
      { key: 'footerExplore', label: 'Footer — Explore column', repeat: REPEAT_BLOCKS[0] },
      { key: 'footerQuick', label: 'Footer — Quick links column', repeat: REPEAT_BLOCKS[0] },
    ],
  },

  // ── Founder's message (#founder) ─────────────────────────────────────────
  founder: {
    label: "Founder's Message",
    groups: [
      { key: 'main', label: 'Message', fields: [
          { key: 'heading', label: 'Heading', kind: 'text' },
          { key: 'founderName', label: 'Founder name', kind: 'text' },
          { key: 'founderRole', label: 'Role / title', kind: 'text' },
          { key: 'signature', label: 'Signature image', kind: 'image' },
          { key: 'body', label: 'Message', kind: 'richtext' },
          { key: 'portrait', label: 'Portrait', kind: 'image' },
          { key: 'show', label: 'Show section', kind: 'boolean' },
        ] },
    ],
  },

  // ── Our Vision (#ourvision) ──────────────────────────────────────────────
  vision: {
    label: 'Our Vision',
    groups: [
      { key: 'main', label: 'Vision', fields: [
          { key: 'heading', label: 'Heading', kind: 'text' },
          { key: 'subheading', label: 'Subheading', kind: 'text' },
          { key: 'body', label: 'Body', kind: 'richtext' },
          { key: 'pillars', label: 'Pillars', repeat: REPEAT_BLOCKS[0] },
          { key: 'image', label: 'Image', kind: 'image' },
          { key: 'show', label: 'Show section', kind: 'boolean' },
        ] },
    ],
  },

  // ── About the institution ────────────────────────────────────────────────
  about: {
    label: 'About Our Institution',
    groups: [
      { key: 'main', label: 'About', fields: [
          { key: 'heading', label: 'Heading', kind: 'text' },
          { key: 'body', label: 'Body', kind: 'richtext' },
          { key: 'image', label: 'Image', kind: 'image' },
          { key: 'highlights', label: 'Highlights', repeat: REPEAT_BLOCKS[0] },
          { key: 'show', label: 'Show section', kind: 'boolean' },
        ] },
    ],
  },

  // ── Campus (#campus) ─────────────────────────────────────────────────────
  campus: {
    label: 'Upcoming Campus',
    groups: [
      { key: 'main', label: 'Campus', fields: [
          { key: 'heading', label: 'Heading', kind: 'text' },
          { key: 'subheading', label: 'Subheading', kind: 'text' },
          { key: 'body', label: 'Body', kind: 'richtext' },
          { key: 'videoUrl', label: 'Walkthrough video URL', kind: 'link' },
          { key: 'videoPoster', label: 'Video poster image', kind: 'image' },
          { key: 'gallery', label: 'Gallery images', repeat: { ...REPEAT_BLOCKS[0], label: 'Images', fields: [
              { key: 'title', label: 'Caption', kind: 'text' },
              { key: 'image', label: 'Image', kind: 'image' },
              { key: 'link', label: 'Link', kind: 'link' },
            ] } },
          { key: 'ctaLabel', label: 'Button label', kind: 'text' },
          { key: 'ctaLink', label: 'Button link', kind: 'link' },
          { key: 'show', label: 'Show section', kind: 'boolean' },
        ] },
    ],
  },

  // ── Contact / CTA block ("Create something beautiful with us") ───────────
  contact: {
    label: 'Contact Strip',
    groups: [
      { key: 'main', label: 'Contact', fields: [
          { key: 'heading', label: 'Heading', kind: 'text' },
          { key: 'body', label: 'Body', kind: 'textarea' },
          { key: 'ctaLabel', label: 'Button label', kind: 'text' },
          { key: 'ctaLink', label: 'Button link', kind: 'link' },
          { key: 'show', label: 'Show section', kind: 'boolean' },
        ] },
    ],
  },

  // ── Legal pages ──────────────────────────────────────────────────────────
  legal: {
    label: 'Legal Pages',
    groups: [
      { key: 'pages', label: 'Pages', repeat: { key: 'pages', label: 'Pages', fields: [
          { key: 'title', label: 'Title', kind: 'text', required: true },
          { key: 'slug', label: 'URL slug', kind: 'text', required: true },
          { key: 'body', label: 'Content', kind: 'richtext' },
          { key: 'showInFooter', label: 'Show in footer', kind: 'boolean' },
          { key: 'published', label: 'Published', kind: 'boolean' },
        ] } },
    ],
  },
};

module.exports = { CMS_FIELD_SCHEMAS };