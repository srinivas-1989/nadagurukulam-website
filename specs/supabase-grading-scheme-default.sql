-- One default grading scheme so results grade out of the box. Bands are data
-- (§36): the portal's grading_schemes editor can change or add schemes freely,
-- and this row is only a starting point. Idempotent on the unique name.
insert into public.grading_schemes (name, scale_max, passing_percent, is_default, notes, bands) values
  ('10-Point Scale', 100, 40, true, 'Default scale — editable in the portal.', '[
    {"min_percent": 90, "grade": "O",  "grade_point": 10},
    {"min_percent": 80, "grade": "A+", "grade_point": 9},
    {"min_percent": 70, "grade": "A",  "grade_point": 8},
    {"min_percent": 60, "grade": "B+", "grade_point": 7},
    {"min_percent": 50, "grade": "B",  "grade_point": 6},
    {"min_percent": 40, "grade": "P",  "grade_point": 5}
  ]'::jsonb)
on conflict (name) do nothing;
