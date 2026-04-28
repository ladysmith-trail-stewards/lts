/**
 * GeneralGeomPopup
 *
 * Shown when the user clicks a general-geometry feature on the map.
 * Rendered into a Mapbox popup via a React portal in MapPage.
 */
import { HugeiconsIcon } from '@hugeicons/react';
import { GEOM_GROUP_META, type GeomGroupKey } from '@/lib/geomTypeMeta';

export interface GeneralGeomPopupFeature {
  /** DB row id */
  id: number;
  collectionLabel: string;
  label: string;
  type: string;
  subtype: string | null;
  description: string | null;
  geometryGroup: 'Point' | 'LineString' | 'Polygon' | string;
  lat: number;
  lng: number;
  elevation: number | null;
}

interface Props {
  feature: GeneralGeomPopupFeature;
  onClose: () => void;
}

function DescriptionBlock({ text }: { text: string }) {
  let pretty: string | null = null;
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null) {
      pretty = JSON.stringify(parsed, null, 2);
    }
  } catch {
    // not JSON — render as plain text
  }

  if (pretty) {
    return (
      <pre className="text-[10px] leading-snug text-slate-600 max-h-36 overflow-y-auto whitespace-pre-wrap break-words bg-slate-50 rounded p-1 pr-0.5 font-mono">
        {pretty}
      </pre>
    );
  }

  return (
    <p className="whitespace-pre-wrap leading-snug text-slate-600 max-h-28 overflow-y-auto break-words pr-0.5">
      {text}
    </p>
  );
}

export function GeneralGeomPopup({ feature, onClose }: Props) {
  const {
    lat,
    lng,
    elevation,
    collectionLabel,
    label,
    type,
    subtype,
    description,
    geometryGroup,
  } = feature;

  const meta =
    GEOM_GROUP_META[geometryGroup as GeomGroupKey] ?? GEOM_GROUP_META.Geometry;

  return (
    <div className="relative text-xs text-slate-700 w-60 space-y-1.5 pr-3">
      <div className="flex items-center gap-1.5 pr-4">
        <span className="shrink-0 text-slate-400">
          <HugeiconsIcon icon={meta.icon} size={15} />
        </span>
        <p
          className="text-sm font-semibold leading-tight text-slate-900 break-words"
          title={label}
        >
          {label}
        </p>
      </div>

      <div className="border-t border-slate-100" />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            Collection
          </p>
          <p className="truncate leading-snug" title={collectionLabel}>
            {collectionLabel}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            Location
          </p>
          <p className="font-mono text-slate-600 text-[10px]">
            {lat.toFixed(5)}
          </p>
          <p className="font-mono text-slate-600 text-[10px]">
            {lng.toFixed(5)}
          </p>
          {elevation != null && (
            <p className="font-mono text-slate-500 text-[10px]">
              {elevation} m
            </p>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            Geometry
          </p>
          <p className="leading-snug">{meta.label}</p>
        </div>
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            Type A
          </p>
          <p className="truncate leading-snug" title={type}>
            {type || '—'}
          </p>
        </div>
        {subtype && (
          <div className="text-right shrink-0">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              Type B
            </p>
            <p className="truncate leading-snug" title={subtype}>
              {subtype}
            </p>
          </div>
        )}
      </div>
      {description && (
        <>
          <div className="border-t border-slate-100" />
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">
              Description
            </p>
            <DescriptionBlock text={description} />
          </div>
        </>
      )}
      <button
        onClick={onClose}
        className="absolute top-0 right-0 text-slate-400 hover:text-slate-600 text-base leading-none"
        aria-label="Close"
      >
        ×
      </button>
    </div>
  );
}
