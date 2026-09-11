// One-time seed of the initial CMS home block, so the public site isn't blank on first run.
// Everything seeded here is immediately editable in the app (Super Admin → inline editor).
// Idempotent: skips if the cms/home block already exists. Run from backend/: node scripts/seed-cms.js
require('dotenv').config();
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  content: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });
const CmsBlock = mongoose.models.CmsBlock || mongoose.model('CmsBlock', schema);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || '', { dbName: 'nadagurukulam' });
  const existing = await CmsBlock.findOne({ key: 'home' }).lean();
  if (existing) {
    console.log('cms/home already exists — skipped');
  } else {
    await CmsBlock.create({
      key: 'home',
      content: {
        heroHeading: 'Nurturing Talent, Inspiring Excellence',
        heroTagline: 'One World, One Family',
        heroLede: "Nada Gurukulam blends India's timeless classical performing arts traditions with contemporary academic management under Sadguru Sri Madhusudan Sai. 100% free of cost.",
        disciplinesHeading: 'Disciplines Taught',
        disciplinesSub: 'Offered completely free of charge, funded entirely by donations.',
      },
    });
    console.log('cms/home seeded (hero + disciplines headings)');
  }
  await mongoose.disconnect();
})().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
