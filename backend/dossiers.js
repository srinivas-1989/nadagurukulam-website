// Student Dossiers — blueprint schema, section-scoped filling, and the
// mentor → campus incharge → finalised lifecycle.
//
// Every authorisation decision lives here, never in the React page. The API
// runs on the service-role client, which bypasses RLS, so these checks are the
// only thing standing between a hostel mentor and another student's record.

const { calculateScores } = require('./scoring');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_VERSIONS = 40;

// Roles that fill a dossier without holding any admin rights.
const FILLER_ROLES = new Set(['hostel_mentor', 'academic_teacher']);
// Roles that review and finalise. Super Admin is handled separately.
const REVIEWER_ROLES = new Set(['campus_incharge']);

function registerDossierRoutes({ app, authMiddleware, supabase, requireLevel, recordAudit }) {

  const isSuperAdmin = profile => profile.role_key === 'super_admin';

  // The blueprint a student's dossier is filled against. Explicit per-user
  // assignment wins; otherwise the student's hostel mentor's blueprint, which
  // is what makes one mentor's students share a form.
  async function resolveBlueprintId(studentId) {
    const { data: student } = await supabase
      .from('users').select('dossier_blueprint_id').eq('id', studentId).maybeSingle();
    if (student && student.dossier_blueprint_id) return student.dossier_blueprint_id;

    const { data: relationship } = await supabase
      .from('student_relationships')
      .select('mentor_id')
      .eq('student_id', studentId)
      .eq('relationship_type', 'hostel_mentor')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (!relationship) return null;

    const { data: mentor } = await supabase
      .from('users').select('dossier_blueprint_id').eq('id', relationship.mentor_id).maybeSingle();
    return mentor && mentor.dossier_blueprint_id;
  }

  async function loadSchema(blueprintId) {
    if (!blueprintId) return { blueprint: null, sections: [] };
    const { data: blueprint } = await supabase
      .from('evaluation_blueprints').select('*').eq('id', blueprintId).maybeSingle();
    if (!blueprint) return { blueprint: null, sections: [] };

    const { data: sections } = await supabase
      .from('evaluation_sections').select('*')
      .eq('blueprint_id', blueprintId).eq('is_deleted', false).order('order');
    const ids = (sections || []).map(s => s.id);

    const { data: questions } = ids.length
      ? await supabase.from('evaluation_questions').select('*')
          .in('section_id', ids).eq('is_deleted', false).order('order_index')
      : { data: [] };

    return {
      blueprint,
      sections: (sections || []).map(s => ({
        ...s,
        questions: (questions || []).filter(q => q.section_id === s.id)
      }))
    };
  }

  // The section ids this caller may edit on this student's dossier.
  //
  // Precedence, narrowest first:
  //   1. explicit section assignments  — a teacher given one section gets one
  //      section and nothing else, whatever their role would otherwise allow;
  //   2. role against section.editable_by — mentors fill, wardens finalise;
  //   3. nothing, for anyone whose role is in neither list.
  async function editableSectionIds(profile, studentId, sections) {
    const all = sections.map(s => s.id);
    if (isSuperAdmin(profile)) return all;

    const { data: assignments } = await supabase
      .from('dossier_section_assignments').select('section_id').eq('user_id', profile.id);
    const assigned = (assignments || []).map(a => a.section_id).filter(id => all.includes(id));
    if (assigned.length) return assigned;

    const role = profile.role_key;
    if (!FILLER_ROLES.has(role) && !REVIEWER_ROLES.has(role)) return [];

    const permitted = sections.filter(s => (s.editable_by || []).includes(role)).map(s => s.id);

    // A hostel mentor may fill only the sections that cover their own students.
    if (role === 'hostel_mentor') {
      const { data: relationship } = await supabase
        .from('student_relationships').select('id')
        .eq('student_id', studentId).eq('mentor_id', profile.id)
        .eq('status', 'active').limit(1).maybeSingle();
      if (!relationship) return [];
    }

    return permitted.filter(id => all.includes(id));
  }

  async function readableSectionIds(profile, studentId, sections) {
    if (isSuperAdmin(profile)) return sections.map(s => s.id);
    const editable = await editableSectionIds(profile, studentId, sections);
    // Reviewers see the whole sheet so they can review it; everyone else sees
    // only what they could also write.
    if (REVIEWER_ROLES.has(profile.role_key)) return sections.map(s => s.id);
    return editable;
  }

  async function pushVersion(assessment, toStatus, req, reason) {
    const { data: existing } = await supabase
      .from('student_assessment_versions')
      .select('version_no').eq('assessment_id', assessment.id)
      .order('version_no', { ascending: false }).limit(1);
    const nextNo = existing && existing.length ? existing[0].version_no + 1 : 1;

    await supabase.from('student_assessment_versions').insert({
      assessment_id: assessment.id,
      version_no: nextNo,
      from_status: assessment.status_state,
      to_status: toStatus,
      reason: reason || null,
      snapshot: {
        blueprint_snapshot: assessment.blueprint_snapshot,
        responses: assessment.responses,
        files: assessment.files,
        flags: assessment.flags,
        submitted_by: assessment.submitted_by,
        submitted_at: assessment.submitted_at
      },
      created_by: req.auth.user.id
    });

    // The fallback history is capped so one student tracked for years cannot
    // grow this table without bound.
    if (nextNo > MAX_VERSIONS) {
      const { data: stale } = await supabase
        .from('student_assessment_versions')
        .select('id').eq('assessment_id', assessment.id)
        .order('version_no', { ascending: false }).range(MAX_VERSIONS, MAX_VERSIONS + 49);
      if (stale && stale.length) {
        await supabase.from('student_assessment_versions').delete().in('id', stale.map(v => v.id));
      }
    }
  }

  const loadAssessment = async (studentId, month) =>
    supabase.from('student_assessments')
      .select('*').eq('student_id', studentId).eq('month', month).maybeSingle();

  // ── Blueprint schema + current assessment ────────────────────────────────
  app.get('/api/dossiers/students/:studentId/:month', authMiddleware, async (req, res) => {
    try {
      if (!await requireLevel(req, res, 'dossiers', 'list')) return;
      const { studentId, month } = req.params;
      if (!MONTH_RE.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });

      const blueprintId = await resolveBlueprintId(studentId);
      const { blueprint, sections } = await loadSchema(blueprintId);
      const visible = await readableSectionIds(req.auth.profile, studentId, sections);

      const { data: assessment } = await loadAssessment(studentId, month);
      const editable = new Set(await editableSectionIds(req.auth.profile, studentId, sections));
      // A locked record is read-only for everyone except someone explicitly
      // reopening it, which is a separate endpoint.
      const locked = assessment && ['submitted', 'in_review', 'finalized'].includes(assessment.status_state);

      res.json({
        blueprint,
        month,
        status: assessment ? assessment.status_state : 'draft',
        locked,
        submitted_at: assessment ? assessment.submitted_at : null,
        assessment_id: assessment ? assessment.id : null,
        responses: assessment ? assessment.responses : {},
        files: assessment ? assessment.files : {},
        flags: assessment ? assessment.flags : {},
        sections: sections
          .filter(s => visible.includes(s.id))
          .map(s => ({ ...s, can_edit: editable.has(s.id) && !locked })),
        scores: assessment ? calculateScores(sections, assessment.responses || {}) : null
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Save a draft or submit for review ────────────────────────────────────
  app.post('/api/dossiers/students/:studentId/:month', authMiddleware, async (req, res) => {
    try {
      if (!await requireLevel(req, res, 'dossiers', 'create')) return;
      const { studentId, month } = req.params;
      if (!MONTH_RE.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });

      const blueprintId = await resolveBlueprintId(studentId);
      const { blueprint, sections } = await loadSchema(blueprintId);
      if (!blueprint) return res.status(400).json({ error: 'No evaluation blueprint is assigned to this student.' });

      const { data: existing } = await loadAssessment(studentId, month);
      if (existing && ['submitted', 'in_review', 'finalized'].includes(existing.status_state)) {
        return res.status(409).json({ error: `This dossier is ${existing.status_state.replace('_', ' ')} and locked. Ask a campus incharge to reopen it.` });
      }

      const allowed = new Set(await editableSectionIds(req.auth.profile, studentId, sections));
      if (!allowed.size) return res.status(403).json({ error: 'You have not been assigned any section of this dossier.' });

      const allowedQids = new Set();
      for (const section of sections) {
        if (allowed.has(section.id)) section.questions.forEach(q => allowedQids.add(q.id));
      }
      if (!allowedQids.size) return res.status(403).json({ error: 'No questions fall inside your assigned sections.' });

      const responses = { ...(existing ? existing.responses : {}) };
      const files = { ...(existing ? existing.files : {}) };
      const touched = new Set();

      // Deletions are explicit because the server merges rather than replaces:
      // two people filling different sections must not clobber each other.
      for (const qid of (req.body.cleared_qids || [])) {
        if (allowedQids.has(qid)) { delete responses[qid]; delete files[qid]; }
      }
      for (const [qid, value] of Object.entries(req.body.responses || {})) {
        if (!allowedQids.has(qid)) continue;
        if (value === null || value === '' || (Array.isArray(value) && !value.length)) {
          delete responses[qid];
        } else {
          responses[qid] = value;
        }
        touched.add(qid);
      }
      for (const [qid, value] of Object.entries(req.body.files || {})) {
        if (allowedQids.has(qid)) files[qid] = value;
      }

      const submit = req.body.action_type === 'submit';
      // Submitting means every answer you are responsible for is filled in.
      // A partial submit would hand the incharge a dossier the mentor has
      // already signed off on.
      if (submit) {
        const unanswered = [...allowedQids].filter(q => responses[q] === undefined);
        if (unanswered.length) {
          return res.status(400).json({ error: `${unanswered.length} question(s) in your sections are still blank.`, unanswered });
        }
      }

      const sectionLastEdit = { ...(existing ? existing.section_last_edit : {}) };
      const now = new Date().toISOString();
      for (const qid of touched) {
        const section = sections.find(s => s.questions.some(q => q.id === qid));
        if (section) sectionLastEdit[section.id] = now;
      }

      const targetState = submit ? 'submitted' : 'draft';
      // A draft tracks the live blueprint so mentors always fill the current
      // form; a submitted dossier freezes its schema for the reviewer.
      const blueprintSnapshot = submit ? { blueprint, sections } : existing && existing.blueprint_snapshot ? existing.blueprint_snapshot : { blueprint, sections };

      const payload = {
        student_id: studentId,
        month,
        blueprint_id: blueprintId,
        blueprint_snapshot: blueprintSnapshot,
        responses,
        files,
        status_state: targetState,
        section_last_edit: sectionLastEdit,
        dossier_last: { by: req.auth.user.id, at: now, action: submit ? 'submit' : 'save' },
        submitted_by: submit ? req.auth.user.id : existing ? existing.submitted_by : null,
        submitted_at: submit ? now : existing ? existing.submitted_at : null,
        updated_at: now
      };

      const { data: saved, error } = existing
        ? await supabase.from('student_assessments').update(payload).eq('id', existing.id).select().single()
        : await supabase.from('student_assessments').insert(payload).select().single();
      if (error) throw error;

      if (existing && existing.status_state !== targetState) await pushVersion(existing, targetState, req, submit ? 'Submitted for review' : 'Saved');

      await recordAudit(req, {
        action: submit ? 'update' : 'update',
        entityType: 'student_assessments', entityId: saved.id,
        summary: `${submit ? 'Submitted' : 'Saved'} dossier for student ${studentId}, ${month} (${touched.size} answer(s))`,
      });

      res.json({ status: saved.status_state, updated_at: saved.updated_at, sections_touched: [...touched].length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Lifecycle: review → finalize → reopen ────────────────────────────────
  const transition = (action, { from, to, gate }) =>
    app.post(`/api/dossiers/students/:studentId/:month/${action}`, authMiddleware, async (req, res) => {
      try {
        const level = await requireLevel(req, res, 'dossiers', 'update');
        if (!level) return;

        const allowed = isSuperAdmin(req.auth.profile)
          || (gate === 'manage' ? level === 'Full' : REVIEWER_ROLES.has(req.auth.profile.role_key));
        if (!allowed) return res.status(403).json({ error: 'You are not authorised to perform this step.' });

        const { studentId, month } = req.params;
        if (!MONTH_RE.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });

        const { data: assessment } = await loadAssessment(studentId, month);
        if (!assessment) return res.status(404).json({ error: 'No dossier for that student and month.' });
        if (from && !from.includes(assessment.status_state)) {
          return res.status(409).json({ error: `Cannot ${action} a dossier that is ${assessment.status_state.replace('_', ' ')}.` });
        }

        const patch = { status_state: to, updated_at: new Date().toISOString(), dossier_last: { by: req.auth.user.id, at: new Date().toISOString(), action } };
        if (to === 'finalized') patch.reviewed_at = new Date().toISOString();

        const { data: saved, error } = await supabase
          .from('student_assessments').update(patch).eq('id', assessment.id).select().single();
        if (error) throw error;

        await pushVersion(assessment, to, req, String(req.body.reason || '').trim() || null);
        await recordAudit(req, {
          action: 'update', entityType: 'student_assessments', entityId: assessment.id,
          summary: `Dossier ${assessment.status_state} → ${to}`, previousValue: { status: assessment.status_state }, newValue: { status: to, reason: req.body.reason || null },
        });
        res.json({ status: saved.status_state });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

  transition('review', { from: ['submitted'], to: 'in_review' });
  transition('finalize', { from: ['submitted', 'in_review'], to: 'finalized' });
  // Reopening is deliberately the narrowest gate in the app: only a Full-level
  // dossiers holder or Super Admin can undo a submission or a finalisation.
  transition('reopen', { from: ['submitted', 'in_review', 'finalized'], to: 'draft', gate: 'manage' });

  // ── Version history ──────────────────────────────────────────────────────
  app.get('/api/dossiers/assessments/:id/versions', authMiddleware, async (req, res) => {
    try {
      if (!await requireLevel(req, res, 'dossiers', 'list')) return;
      const { data: versions } = await supabase
        .from('student_assessment_versions').select('*')
        .eq('assessment_id', req.params.id).order('version_no', { ascending: false });
      res.json(versions || []);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Restore a past version into the working draft. Same gate as reopen.
  app.post('/api/dossiers/assessments/:id/restore/:versionNo', authMiddleware, async (req, res) => {
    try {
      const level = await requireLevel(req, res, 'dossiers', 'update');
      if (!level) return;
      if (!isSuperAdmin(req.auth.profile) && level !== 'Full') {
        return res.status(403).json({ error: 'Only a Full-level dossiers holder or Super Admin can restore a version.' });
      }
      const { data: version } = await supabase
        .from('student_assessment_versions').select('*')
        .eq('assessment_id', req.params.id).eq('version_no', req.params.versionNo).maybeSingle();
      if (!version) return res.status(404).json({ error: 'Version not found.' });

      const { data: assessment } = await supabase.from('student_assessments').select('*').eq('id', req.params.id).maybeSingle();
      if (!assessment) return res.status(404).json({ error: 'Dossier not found.' });

      const snapshot = version.snapshot || {};
      const now = new Date().toISOString();
      await pushVersion(assessment, 'draft', req, `Restored version ${version.version_no}`);

      const { data: saved, error } = await supabase.from('student_assessments').update({
        responses: snapshot.responses || {},
        files: snapshot.files || {},
        flags: snapshot.flags || {},
        status_state: 'draft',
        updated_at: now,
        dossier_last: { by: req.auth.user.id, at: now, action: `restore v${version.version_no}` }
      }).eq('id', assessment.id).select().single();
      if (error) throw error;

      await recordAudit(req, {
        action: 'update', entityType: 'student_assessments', entityId: assessment.id,
        summary: `Restored dossier to version ${version.version_no}`, previousValue: { version: version.version_no },
      });
      res.json({ status: saved.status_state, restored_from: version.version_no });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Highlights (questions, doubts and flags) ─────────────────────────────
  app.post('/api/dossiers/students/:studentId/:month/highlights', authMiddleware, async (req, res) => {
    try {
      if (!await requireLevel(req, res, 'dossiers', 'create')) return;
      const { studentId, month } = req.params;
      const { data: assessment } = await loadAssessment(studentId, month);
      if (!assessment) return res.status(404).json({ error: 'No dossier for that student and month.' });

      const blueprintId = await resolveBlueprintId(studentId);
      const { sections } = await loadSchema(blueprintId);
      const readable = new Set(await readableSectionIds(req.auth.profile, studentId, sections));
      const questionId = String(req.body.question_id || '');
      const section = sections.find(s => s.questions.some(q => q.id === questionId));
      if (!section || !readable.has(section.id)) {
        return res.status(403).json({ error: 'That question is not part of the dossier you can see.' });
      }

      const flags = { ...(assessment.flags || {}) };
      const id = crypto.randomUUID();
      flags[id] = {
        question_id: questionId,
        message: String(req.body.message || '').slice(0, 4000),
        raised_by: req.auth.user.id,
        raised_at: new Date().toISOString(),
        resolved: false,
        replies: []
      };

      const { error } = await supabase.from('student_assessments')
        .update({ flags, updated_at: new Date().toISOString() }).eq('id', assessment.id);
      if (error) throw error;
      res.status(201).json({ id, flags });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/dossiers/students/:studentId/:month/highlights/:flagId/:action', authMiddleware, async (req, res) => {
    try {
      if (!await requireLevel(req, res, 'dossiers', 'create')) return;
      const { studentId, month, flagId, action } = req.params;
      if (!['reply', 'resolve'].includes(action)) return res.status(400).json({ error: 'Unknown highlight action' });

      const { data: assessment } = await loadAssessment(studentId, month);
      if (!assessment) return res.status(404).json({ error: 'No dossier for that student and month.' });

      const flags = { ...(assessment.flags || {}) };
      if (!flags[flagId]) return res.status(404).json({ error: 'Highlight not found.' });

      if (action === 'reply') {
        flags[flagId].replies.push({
          by: req.auth.user.id, at: new Date().toISOString(),
          text: String(req.body.text || '').slice(0, 4000)
        });
      } else {
        flags[flagId].resolved = true;
        flags[flagId].resolved_by = req.auth.user.id;
        flags[flagId].resolved_at = new Date().toISOString();
      }

      const { error } = await supabase.from('student_assessments')
        .update({ flags, updated_at: new Date().toISOString() }).eq('id', assessment.id);
      if (error) throw error;
      res.json({ flags });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { registerDossierRoutes };