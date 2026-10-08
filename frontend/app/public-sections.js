'use client';

// The reference website's editorial sections, rendered from CMS blocks.
// A block that was never saved renders nothing, so the page degrades cleanly
// to whatever the Super Admin has actually published.
//
// Body text is rendered as plain text, never as HTML. Admin-authored markup on a
// public page is a stored-XSS vector, and pre-wrap already gives the paragraph
// breaks the copy needs.
const sectionStyle = { marginTop: '56px' };
const headingStyle = { fontSize: 'clamp(24px, 3vw, 32px)', color: 'var(--primary-deep)', margin: '0 0 6px' };
const kickerStyle = { fontSize: '12.5px', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--accent-deep)', textTransform: 'uppercase', margin: '0 0 8px' };
const bodyStyle = { color: 'var(--text-soft)', fontSize: '15.5px', lineHeight: 1.7, margin: '12px 0 0', whiteSpace: 'pre-wrap' };

const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px', marginTop: '20px' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '20px' };
const ctaStyle = { display: 'inline-block', marginTop: '18px', background: 'var(--primary)', color: '#fff', padding: '12px 26px', borderRadius: 'var(--radius-xl-sm)', fontWeight: 600, textDecoration: 'none' };

function Text({ value, style = bodyStyle }) {
  if (!value) return null;
  return <p style={style}>{value}</p>;
}

function ItemCards({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div style={gridStyle}>
      {items.map((it, i) => (
        <div key={i} style={cardStyle}>
          {it.image && <img src={it.image} alt={it.title || ''} style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: 'var(--radius-xl-sm)', marginBottom: '12px' }} />}
          {it.title && <h4 style={{ margin: 0, fontSize: '16px', color: 'var(--primary)' }}>{it.title}</h4>}
          {it.subtitle && <div style={{ fontSize: '13px', color: 'var(--text-faint)', marginTop: '4px' }}>{it.subtitle}</div>}
          <Text value={it.body} style={{ fontSize: '14px', marginTop: '8px' }} />
          {it.link && (
            <a href={it.link} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '10px', fontSize: '13px', fontWeight: 600, color: 'var(--primary)' }}>Learn more →</a>
          )}
        </div>
      ))}
    </div>
  );
}

// Founder's message and the vision statement share a shape: portrait beside the
// text, both optional, hidden when the admin unchecks "Show section".
function PortraitSection({ block, kicker }) {
  if (!block || block.show === false) return null;
  if (!block.heading && !block.body && !block.portrait && !block.image) return null;
  const portrait = block.portrait || block.image;

  return (
    <section style={sectionStyle}>
      {kicker && <p style={kickerStyle}>{kicker}</p>}
      <h3 style={headingStyle}>{block.heading}</h3>
      <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'flex-start', marginTop: '20px' }}>
        {portrait && <img src={portrait} alt="" style={{ width: '280px', maxWidth: '100%', borderRadius: 'var(--radius-xl)' }} />}
        <div style={{ flex: '1 1 340px', minWidth: '0' }}>
          {block.founderName && <div style={{ fontWeight: 700, fontSize: '17px', color: 'var(--primary)' }}>{block.founderName}</div>}
          {block.founderRole && <div style={{ fontSize: '13.5px', color: 'var(--text-faint)', marginTop: '2px' }}>{block.founderRole}</div>}
          <Text value={block.body} />
          {block.signature && <img src={block.signature} alt="" style={{ marginTop: '16px', height: '56px' }} />}
        </div>
      </div>
    </section>
  );
}

export function CmsSections({ blocks }) {
  const about = blocks?.about?.about;
  const founder = blocks?.founder?.founder;
  const vision = blocks?.vision?.vision;
  const campus = blocks?.campus?.campus;
  const gallery = blocks?.campus?.gallery;
  const contact = blocks?.contact?.contact;
  const faculty = blocks?.faculty?.faculty;
  const galleryBlock = blocks?.gallery?.gallery;
  const admission = blocks?.admission?.admission;

  return (
    <>
      {about && (about.heading || about.body || about.image) && (
        <section style={sectionStyle}>
          <h3 style={headingStyle}>{about.heading}</h3>
          <Text value={about.body} />
          {about.image && <img src={about.image} alt="" style={{ width: '100%', maxHeight: '380px', objectFit: 'cover', borderRadius: 'var(--radius-xl)', marginTop: '20px' }} />}
          <ItemCards items={blocks?.about?.highlights} />
        </section>
      )}

      <PortraitSection block={founder} kicker="A message from our Founder" />

      {vision && vision.show !== false && (vision.heading || vision.body || vision.image) && (
        <section style={sectionStyle}>
          <h3 style={headingStyle}>{vision.heading}</h3>
          {vision.subheading && <p style={{ fontSize: '18px', color: 'var(--text-soft)', margin: '0' }}>{vision.subheading}</p>}
          <Text value={vision.body} style={{ marginTop: vision.subheading ? '12px 0 0' : undefined }} />
          {vision.image && <img src={vision.image} alt="" style={{ width: '100%', maxHeight: '380px', objectFit: 'cover', borderRadius: 'var(--radius-xl)', marginTop: '20px' }} />}
          <ItemCards items={blocks?.vision?.pillars} />
        </section>
      )}

      {campus && campus.show !== false && (campus.heading || campus.body || campus.videoUrl) && (
        <section style={sectionStyle}>
          <p style={kickerStyle}>Campus preview</p>
          <h3 style={headingStyle}>{campus.heading}</h3>
          {campus.subheading && <p style={{ fontSize: '18px', color: 'var(--text-soft)', margin: '0 0 12px' }}>{campus.subheading}</p>}
          <Text value={campus.body} />

          {Array.isArray(gallery) && gallery.length > 0 && (
            <div style={{ ...gridStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
              {gallery.map((g, i) => (
                <figure key={i} style={{ margin: 0 }}>
                  <img src={g.image} alt={g.title || ''} style={{ width: '100%', height: '210px', objectFit: 'cover', borderRadius: 'var(--radius-xl)' }} />
                  {(g.title || g.link) && (
                    <figcaption style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '13px', color: 'var(--text-soft)' }}>
                      <span>{g.title}</span>
                      {g.link && <a href={g.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>View</a>}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          )}

          {campus.videoUrl && (
            <a href={campus.videoUrl} target="_blank" rel="noopener noreferrer" style={ctaStyle}>{campus.ctaLabel || 'Watch the walkthrough video'}</a>
          )}
        </section>
      )}

      {faculty && faculty.show !== false && (faculty.heading || blocks?.faculty?.members?.length > 0) && (
        <section style={sectionStyle}>
          <p style={kickerStyle}>Experienced mentors &amp; guides</p>
          <h3 style={headingStyle}>{faculty.heading}</h3>
          <Text value={faculty.subheading} style={{ fontSize: '16px' }} />
          <div style={{ ...gridStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {(blocks?.faculty?.members || []).map((m, i) => (
              <div key={i} style={{ ...cardStyle, textAlign: 'center' }}>
                {m.image && <img src={m.image} alt={m.title || ''} style={{ width: '96px', height: '96px', objectFit: 'cover', borderRadius: '50%', margin: '0 auto 12px' }} />}
                <h4 style={{ margin: 0, fontSize: '14.5px', color: 'var(--primary)' }}>{m.title}</h4>
                {m.subtitle && <div style={{ fontSize: '12.5px', color: 'var(--text-faint)', marginTop: '4px' }}>{m.subtitle}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {galleryBlock && galleryBlock.show !== false && (galleryBlock.heading || blocks?.gallery?.images?.length > 0) && (
        <section style={sectionStyle}>
          <h3 style={headingStyle}>{galleryBlock.heading}</h3>
          <Text value={galleryBlock.subheading} style={{ fontSize: '16px' }} />
          <div style={{ ...gridStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {(blocks?.gallery?.images || []).map((g, i) => (
              <figure key={i} style={{ margin: 0 }}>
                <img src={g.image} alt={g.title || ''} style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: 'var(--radius-xl)' }} />
                {g.title && <figcaption style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-soft)' }}>{g.title}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      {admission && admission.show !== false && (admission.heading || admission.body) && (
        <section style={{ ...sectionStyle, background: 'var(--bg-saffron)', borderRadius: 'var(--radius-xl)', padding: '32px', textAlign: 'center' }}>
          <h3 style={headingStyle}>{admission.heading}</h3>
          <Text value={admission.body} style={{ maxWidth: '60ch', marginLeft: 'auto', marginRight: 'auto' }} />
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '18px' }}>
            {admission.formUrl && (
              <a href={admission.formUrl} download style={ctaStyle}>{admission.formLabel || 'Download the form'}</a>
            )}
            {admission.ctaLink && (
              <a href={admission.ctaLink} target="_blank" rel="noopener noreferrer" style={{ ...ctaStyle, background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)' }}>{admission.ctaLabel || 'Apply online'}</a>
            )}
          </div>
        </section>
      )}

      {contact && contact.show !== false && (contact.heading || contact.body) && (
        <section style={{ ...sectionStyle, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '28px' }}>
          <h3 style={headingStyle}>{contact.heading}</h3>
          <Text value={contact.body} />
          {contact.ctaLink && (
            <a href={contact.ctaLink} target="_blank" rel="noopener noreferrer" style={ctaStyle}>{contact.ctaLabel || 'Get in touch'}</a>
          )}
        </section>
      )}
    </>
  );
}