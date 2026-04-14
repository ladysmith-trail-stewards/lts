-- Trail class and direction option views.
-- These provide the canonical list of allowed values for the `trail_class`
-- and `direction` columns on the `trails` table. Using views over VALUES()
-- keeps the options in the database (no application-level hard-coding) while
-- avoiding the overhead of separate lookup tables.

create view public.trail_class_options as
select value, label, sort_order
from (values
  ('EASIEST',      'Easiest',       1),
  ('EASY',         'Easy',          2),
  ('INTERMEDIATE', 'Intermediate',  3),
  ('BLACK',        'Black',         4),
  ('DOUBLE_BLACK', 'Double Black',  5),
  ('ADVANCED',     'Advanced',      6),
  ('PRO',          'Pro',           7),
  ('ACCESS',       'Access',        8),
  ('PATH',         'Path',          9),
  ('SECONDARY',    'Secondary',    10),
  ('IMBY',         'IMBY',         11),
  ('LIFT',         'Lift',         12),
  ('TBD',          'TBD',          13)
) as t(value, label, sort_order);

comment on view public.trail_class_options is
  'Ordered list of trail difficulty class values and their display labels.';

grant select on public.trail_class_options to anon, authenticated;

-- ---------------------------------------------------------------------------

create view public.trail_direction_options as
select value, label, sort_order
from (values
  ('both',           'Both Ways',          1),
  ('oneway',         'One Way',            2),
  ('oneway-reverse', 'One Way (Reverse)',  3)
) as t(value, label, sort_order);

comment on view public.trail_direction_options is
  'Ordered list of trail direction values and their display labels.';

grant select on public.trail_direction_options to anon, authenticated;
