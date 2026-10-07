-- Optional short label shown wherever the field is referenced.
-- Nodes with no tag keep rendering their own name, so existing rows need nothing.
alter table public.category_level_values
  add column if not exists tag text;