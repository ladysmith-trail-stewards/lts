import type { Trail } from '@/hooks/useTrails';
import type { TrailEditValues } from './trailEditSchema';
import { TRAIL_CLASS_LABELS } from './trailEditSchema';

export function trailToForm(trail: Trail): TrailEditValues {
  return {
    name: trail.name,
    description: trail.description ?? undefined,
    trail_class:
      trail.trail_class != null && trail.trail_class in TRAIL_CLASS_LABELS
        ? (trail.trail_class as TrailEditValues['trail_class'])
        : 'EASIEST',
    direction: ['both', 'oneway', 'oneway-reverse'].includes(
      trail.direction ?? ''
    )
      ? (trail.direction as TrailEditValues['direction'])
      : 'both',
    activity_types: trail.activity_types ?? [],
    planned: trail.planned ?? false,
    connector: trail.connector ?? false,
    visibility: ['public', 'private', 'shared'].includes(trail.visibility ?? '')
      ? (trail.visibility as TrailEditValues['visibility'])
      : 'public',
  };
}

export function extractFormErrors(
  issues: { path?: { key: unknown }[] | undefined; message: string }[]
): Partial<Record<keyof TrailEditValues, string>> {
  const errs: Partial<Record<keyof TrailEditValues, string>> = {};
  for (const issue of issues) {
    const key = issue.path?.[0]?.key as keyof TrailEditValues | undefined;
    if (key) errs[key] = issue.message;
  }
  return errs;
}

export function formatDistance(metres: number | null): string {
  if (metres == null) return '—';
  if (metres > 1999) {
    return `${(metres / 1000).toLocaleString('en', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} km`;
  }
  return `${Math.round(metres).toLocaleString('en')} m`;
}
