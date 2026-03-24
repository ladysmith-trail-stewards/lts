import type { Trail } from '@/hooks/useTrails';
import type { TrailEditValues } from './trailEditSchema';
import { TRAIL_CLASS_LABELS } from './trailEditSchema';

/**
 * Map a Trail row to the form's initial values, applying safe fallbacks for
 * any field that doesn't match the schema's allowed values.
 */
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

/**
 * Extract a flat map of valibot field errors from a failed SafeParseResult.
 */
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
