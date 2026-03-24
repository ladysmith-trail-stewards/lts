import * as v from 'valibot';

export const TrailEditSchema = v.object({
  name: v.pipe(
    v.string(),
    v.minLength(1, 'Name is required'),
    v.maxLength(120)
  ),
  description: v.optional(v.pipe(v.string(), v.maxLength(1000))),
  trail_class: v.picklist([
    'EASIEST',
    'EASY',
    'INTERMEDIATE',
    'BLACK',
    'DOUBLE_BLACK',
    'ADVANCED',
    'PRO',
    'ACCESS',
    'PATH',
    'SECONDARY',
    'IMBY',
    'LIFT',
    'TBD',
  ] as const),
  direction: v.picklist(['both', 'oneway', 'oneway-reverse'] as const),
  activity_types: v.array(v.string()),
  planned: v.boolean(),
  connector: v.boolean(),
  visibility: v.picklist(['public', 'private', 'shared'] as const),
});

export type TrailEditValues = v.InferOutput<typeof TrailEditSchema>;

// ── Display constants (co-located — consumed by helpers + components) ─────────

export const TRAIL_CLASS_LABELS: Record<string, string> = {
  EASIEST: 'Easiest',
  EASY: 'Easy',
  INTERMEDIATE: 'Intermediate',
  BLACK: 'Black',
  DOUBLE_BLACK: 'Double Black',
  ADVANCED: 'Advanced',
  PRO: 'Pro',
  ACCESS: 'Access',
  PATH: 'Path',
  SECONDARY: 'Secondary',
  IMBY: 'IMBY',
  LIFT: 'Lift',
  TBD: 'TBD',
};

export const TRAIL_CLASS_COLORS: Record<string, string> = {
  EASIEST: 'bg-green-500',
  EASY: 'bg-green-500',
  INTERMEDIATE: 'bg-blue-500',
  BLACK: 'bg-slate-900',
  DOUBLE_BLACK: 'bg-red-600',
  ADVANCED: 'bg-indigo-400',
  PRO: 'bg-orange-400',
  ACCESS: 'bg-purple-600',
  PATH: 'bg-slate-200',
  SECONDARY: 'bg-slate-200',
  IMBY: 'bg-yellow-200',
  LIFT: 'bg-yellow-300',
  TBD: 'bg-slate-400',
};

export const DIRECTION_LABELS: Record<string, string> = {
  both: 'Both Ways',
  oneway: 'One Way',
  'oneway-reverse': 'One Way (Reverse)',
};

export const VISIBILITY_LABELS: Record<string, string> = {
  public: 'Anyone',
  shared: 'Power Users',
  private: 'Admin Only',
};

export const ACTIVITY_OPTIONS = [
  { value: 'Biking', label: 'Biking' },
  { value: 'Hiking', label: 'Hiking' },
  { value: 'Trail Running', label: 'Trail Running' },
] as const;
