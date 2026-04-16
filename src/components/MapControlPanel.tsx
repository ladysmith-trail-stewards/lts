import { Plus } from 'lucide-react';
import { MAP_STYLES, type StyleKey } from '@/lib/map/config';
import type { GeneralGeomCollectionOption } from '@/hooks/useGeneralGeom';

interface MapControlPanelProps {
  currentStyle: StyleKey;
  contourStrength: number;
  trailCount: number;
  loading: boolean;
  trailsError: string | null;
  canEdit: boolean;
  isEditing: boolean;
  onStyleChange: (style: StyleKey) => void;
  onContourStrength: (value: number) => void;
  onAddTrail: () => void;
  generalCollections: GeneralGeomCollectionOption[];
  visibleCollectionIds: number[];
  onToggleCollectionVisibility: (collectionId: number, next: boolean) => void;
}

export default function MapControlPanel({
  currentStyle,
  contourStrength,
  trailCount,
  loading,
  trailsError,
  canEdit,
  isEditing,
  onStyleChange,
  onContourStrength,
  onAddTrail,
  generalCollections,
  visibleCollectionIds,
  onToggleCollectionVisibility,
}: MapControlPanelProps) {
  const visibleSet = new Set(visibleCollectionIds);

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[200px] space-y-3 max-h-[80vh] overflow-y-auto">
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Style
        </h3>
        <div className="space-y-1.5">
          {(Object.keys(MAP_STYLES) as StyleKey[]).map((key) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="mapStyle"
                value={key}
                checked={currentStyle === key}
                onChange={() => onStyleChange(key)}
                className="w-3.5 h-3.5 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm text-slate-700 capitalize">{key}</span>
            </label>
          ))}
        </div>
      </div>

      {!loading && !trailsError && (
        <div className="border-t pt-2 space-y-2">
          <p className="text-xs text-slate-500">
            {trailCount} trail{trailCount !== 1 ? 's' : ''} loaded
          </p>
          {canEdit && !isEditing && (
            <button
              onClick={onAddTrail}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md
                bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium
                transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Trail
            </button>
          )}
        </div>
      )}

      <div className="border-t pt-3 space-y-1.5">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Feature Collections
        </h3>
        {generalCollections.length === 0 ? (
          <p className="text-xs text-slate-500">No imported collections</p>
        ) : (
          generalCollections.map((collection) => (
            <label
              key={collection.id}
              className="flex items-start gap-2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={visibleSet.has(collection.id)}
                onChange={(e) =>
                  onToggleCollectionVisibility(collection.id, e.target.checked)
                }
                className="mt-0.5 w-3.5 h-3.5 text-green-600 focus:ring-green-500"
              />
              <span className="text-xs text-slate-700 leading-snug">
                {collection.label}
                <span className="text-slate-500">
                  {' '}
                  ({collection.featureCollectionType}, {collection.count})
                </span>
              </span>
            </label>
          ))
        )}
      </div>

      <div className="border-t pt-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Contours
          </span>
          <span className="text-xs text-slate-400">
            {contourStrength === 0 ? 'off' : `${contourStrength}%`}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={contourStrength}
          onChange={(e) => onContourStrength(Number(e.target.value))}
          className="w-full h-1.5 rounded-full accent-amber-600 cursor-pointer"
        />
      </div>
    </div>
  );
}
