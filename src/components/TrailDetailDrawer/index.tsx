import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as v from 'valibot';
import { toast } from 'sonner';
import { X, Check, Loader2, Magnet, Pencil, Trash2 } from 'lucide-react';

import type { Trail } from '@/hooks/useTrails';
import type { DrawTrailApi } from '@/hooks/useDrawTrail';
import type { TrailFeature } from '@/lib/db_services/trails/upsertTrailsDb';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/lib/supabase/database.types';

import {
  TrailEditSchema,
  type TrailEditValues,
  TRAIL_CLASS_LABELS,
  DIRECTION_LABELS,
  VISIBILITY_LABELS,
} from './trailEditSchema';
import {
  trailToForm,
  extractFormErrors,
  formatDistance,
} from './trailEditHelpers';
import {
  InfoBadge,
  TrailClassDot,
  StatusPill,
} from './TrailDetailSubcomponents';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

// ── Types ─────────────────────────────────────────────────────────────────────

type AppRole = Database['public']['Enums']['app_role'];

const EDIT_ROLES: AppRole[] = ['admin', 'super_user', 'super_admin'];
const DELETE_ROLES: AppRole[] = ['admin', 'super_user', 'super_admin'];

const NEW_TRAIL_DEFAULTS: TrailEditValues = {
  name: '',
  description: undefined,
  trail_class: 'EASY',
  direction: 'both',
  activity_types: [],
  planned: false,
  connector: false,
  visibility: 'public',
};

// ── TrailPanel ────────────────────────────────────────────────────────────────
// Handles both existing trails (trail != null) and new trail creation (trail == null).

interface TrailPanelProps {
  trail: Trail | null;
  canEdit: boolean;
  canDelete: boolean;
  drawApi: DrawTrailApi;
  regionId: number | null;
  onClose: () => void;
  onSave: (feature: TrailFeature) => Promise<Trail>;
  onDelete: (id: number) => Promise<void>;
  /** Called when the save succeeds and the trail is new, so the shell can navigate. */
  onCreated: (saved: Trail) => void;
  onNavigateToTrail: (id: number) => void;
  /** Called with the trail id when editing starts, null when editing ends. */
  onEditingTrailChange?: (id: number | null) => void;
}

function TrailPanel({
  trail,
  canEdit,
  canDelete,
  drawApi,
  regionId,
  onClose,
  onSave,
  onDelete,
  onCreated,
  onNavigateToTrail,
  onEditingTrailChange,
}: TrailPanelProps) {
  const isNew = trail === null;

  const [currentTrail, setCurrentTrail] = useState<Trail | null>(trail);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    Partial<Record<keyof TrailEditValues, string>>
  >({});
  const [form, setForm] = useState<TrailEditValues>(
    trail ? trailToForm(trail) : NEW_TRAIL_DEFAULTS
  );

  const drawApiRef = useRef(drawApi);
  useEffect(() => {
    drawApiRef.current = drawApi;
  });

  // Deactivate draw on unmount
  useEffect(() => {
    return () => {
      if (drawApiRef.current.isEditing) {
        drawApiRef.current.deactivateEdit();
      }
    };
  }, []);

  // Guard browser close/refresh while editing
  useEffect(() => {
    if (!editing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [editing]);

  // Sync local form state when navigating to a different trail (id changes).
  // The trail prop itself comes from the parent's list, which useTrails keeps
  // up-to-date after saves, so we don't need to re-fetch here.
  useEffect(() => {
    if (!trail) return;
    setCurrentTrail(trail);
    setForm(trailToForm(trail));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trail?.id]);

  function handleStartEdit() {
    if (!currentTrail) return;
    onEditingTrailChange?.(currentTrail.id);
    drawApi.activateEdit(currentTrail.geometry_geojson, {
      onClickNoTarget: () => {
        /* locked */
      },
      onClickOtherTrail: (id) => {
        if (
          window.confirm('Cancel your unsaved edits and switch to this trail?')
        ) {
          drawApiRef.current.deactivateEdit();
          onEditingTrailChange?.(null);
          setEditing(false);
          onNavigateToTrail(id);
        }
      },
    });
    setEditing(true);
  }

  async function handleSave() {
    const result = v.safeParse(TrailEditSchema, form);
    if (!result.success) {
      setValidationErrors(extractFormErrors(result.issues));
      return;
    }

    type LineStringGeometry = {
      type: 'LineString';
      coordinates: [number, number][];
    };

    const drawnGeometry =
      drawApi.getCurrentGeometry() as LineStringGeometry | null;

    if (isNew) {
      if (!drawnGeometry || drawnGeometry.coordinates.length < 2) {
        setSaveError('Draw at least two points on the map before saving.');
        return;
      }
      if (regionId === null) {
        setSaveError('No region is configured. Contact an administrator.');
        return;
      }
    }

    const geometry: LineStringGeometry =
      drawnGeometry ?? (currentTrail!.geometry_geojson as LineStringGeometry);

    setValidationErrors({});
    setSaving(true);
    setSaveError(null);

    try {
      const saved = await onSave({
        type: 'Feature',
        geometry,
        properties: {
          ...(isNew ? {} : { id: currentTrail!.id }),
          name: result.output.name,
          description: result.output.description ?? null,
          trail_class: result.output.trail_class,
          direction: result.output.direction,
          activity_types: result.output.activity_types,
          planned: result.output.planned,
          connector: result.output.connector,
          visibility: result.output.visibility,
          region_id: isNew ? regionId! : currentTrail!.region_id,
          type: isNew ? 'trail' : currentTrail!.type,
        },
      });

      onEditingTrailChange?.(null);
      drawApi.deactivateEdit();

      if (isNew) {
        onCreated(saved);
        toast.success(`"${saved.name}" created successfully.`);
      } else {
        setCurrentTrail(saved);
        setForm(trailToForm(saved));
        setEditing(false);
        toast.success(`"${saved.name}" saved successfully.`);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    if (
      drawApi.isDirty &&
      !window.confirm(
        isNew
          ? 'Discard the new trail and cancel?'
          : 'Discard geometry changes and cancel editing?'
      )
    ) {
      return;
    }
    drawApi.deactivateEdit();
    onEditingTrailChange?.(null);
    if (isNew) {
      onClose();
    } else {
      setForm(trailToForm(currentTrail!));
      setEditing(false);
      setSaveError(null);
      setValidationErrors({});
    }
  }

  async function handleDelete() {
    if (!currentTrail) return;
    if (
      !window.confirm(
        `Are you sure you want to delete "${currentTrail.name}"? This action cannot be undone.`
      )
    ) {
      return;
    }
    setDeleting(true);
    setSaveError(null);
    try {
      await onDelete(currentTrail.id);
      drawApi.deactivateEdit();
      onEditingTrailChange?.(null);
      toast.success(`"${currentTrail.name}" deleted successfully.`);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-row items-start justify-between gap-2 px-4 pt-4 pb-2">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-1">
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                className="text-lg font-bold h-9"
                placeholder="Trail name"
                autoFocus
              />
              {validationErrors.name && (
                <p className="text-xs text-red-500">{validationErrors.name}</p>
              )}
            </div>
          ) : (
            <h2 className="text-xl font-bold leading-tight text-slate-900">
              {currentTrail?.name}
            </h2>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
            title="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Edit mode toggle */}
      {(isNew || canEdit) && (
        <EditModeToggle
          drawApi={drawApi}
          canEdit={isNew || canEdit}
          hasGeometry={isNew ? drawApi.isEditing : true}
          onCancel={handleCancelEdit}
          onDone={() => drawApi.finishEdit()}
          onSave={handleSave}
          onDrawClick={() => {
            if (isNew) {
              if (!drawApi.isEditing) {
                drawApi.activateCreate();
              } else {
                drawApi.toggleDraw();
              }
            } else {
              if (!editing) {
                handleStartEdit();
              } else {
                drawApi.toggleDraw();
              }
            }
          }}
        />
      )}

      {editing && drawApi.drawMode && (
        <DrawHintBar drawApi={drawApi} mode={drawApi.drawMode} />
      )}

      {/* Hint when new trail hasn't started drawing yet */}
      {isNew && !drawApi.isEditing && (
        <div className="mx-4 mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No trail drawn yet — tap <span className="font-medium">Edit</span> to
          start drawing.
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="px-4 pb-6 space-y-5">
        {/* ── Stats — existing trails only ──────────────────────────────── */}
        {!isNew && currentTrail && (
          <div className="flex gap-2">
            <div className="border rounded-lg p-2 text-center text-xs text-slate-500 w-20 shrink-0 flex flex-col justify-center">
              <div className="font-semibold text-slate-700 text-sm">
                {formatDistance(currentTrail.distance_m)}
              </div>
              <div>Distance</div>
            </div>
            <div className="flex-1 border rounded-lg p-2 text-xs text-slate-500">
              <div className="text-center mb-1 font-medium uppercase tracking-wide text-slate-400 text-[10px]">
                Elevation
              </div>
              <div className="flex divide-x">
                <div className="text-center flex-1 pr-2">
                  <div className="font-semibold text-slate-700 text-sm">—</div>
                  <div>Gain</div>
                </div>
                <div className="text-center flex-1 pl-2">
                  <div className="font-semibold text-slate-700 text-sm">—</div>
                  <div>Descent</div>
                </div>
              </div>
            </div>
            <div className="border rounded-lg p-2 text-center text-xs text-slate-500 w-20 shrink-0 flex flex-col justify-center">
              <div className="font-semibold text-slate-700 text-sm">
                {currentTrail.tf_popularity ?? '—'}
              </div>
              <div>TF Score</div>
            </div>
          </div>
        )}
        {/* ── Elevation Profile ─────────────────────────────────────────── */}
        {/* TODO: unhide once DB tie-in and vertex highlighting are ready */}
        {/* {!isNew && !editing && (
          <ElevationProfileChart
            data={STUB_ELEVATION_DATA}
            onPointClick={() => {
              // TODO: highlight corresponding vertex on the map
            }}
          />
        )} */}
        {/* ── Description ──────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500 uppercase tracking-wide">
            Description
          </Label>
          {editing ? (
            <Textarea
              value={form.description ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  description: e.target.value || undefined,
                }))
              }
              placeholder="Optional description…"
              rows={3}
              className="resize-none"
            />
          ) : (
            <p className="text-sm text-slate-700 whitespace-pre-wrap">
              {currentTrail?.description ?? (
                <span className="text-slate-400">—</span>
              )}
            </p>
          )}
        </div>
        {/* ── Rating ────────────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500 uppercase tracking-wide">
            Rating
          </Label>
          {editing ? (
            <Select
              value={form.trail_class}
              onValueChange={(val) =>
                setForm((f) => ({
                  ...f,
                  trail_class: val as TrailEditValues['trail_class'],
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TRAIL_CLASS_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>
                    <span className="flex items-center gap-2">
                      <TrailClassDot trailClass={val} />
                      {label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center gap-2">
              <TrailClassDot trailClass={currentTrail?.trail_class ?? null} />
              <span className="text-sm text-slate-700">
                {TRAIL_CLASS_LABELS[currentTrail?.trail_class ?? ''] ??
                  currentTrail?.trail_class ??
                  '—'}
              </span>
            </div>
          )}
        </div>
        {/* ── Direction ─────────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500 uppercase tracking-wide">
            Direction
          </Label>
          {editing ? (
            <Select
              value={form.direction}
              onValueChange={(val) =>
                setForm((f) => ({
                  ...f,
                  direction: val as TrailEditValues['direction'],
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DIRECTION_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm text-slate-700">
              {DIRECTION_LABELS[currentTrail?.direction ?? ''] ??
                currentTrail?.direction ??
                '—'}
            </span>
          )}
        </div>
        {/* ── Planning / Connector ──────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Planning?</Label>
            {editing ? (
              <Switch
                checked={form.planned}
                onCheckedChange={(val) =>
                  setForm((f) => ({ ...f, planned: val }))
                }
              />
            ) : (
              <StatusPill on={currentTrail?.planned ?? false} />
            )}
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Connector?</Label>
            {editing ? (
              <Switch
                checked={form.connector}
                onCheckedChange={(val) =>
                  setForm((f) => ({ ...f, connector: val }))
                }
              />
            ) : (
              <StatusPill on={currentTrail?.connector ?? false} />
            )}
          </div>
        </div>
        {/* ── Visibility ───────────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label className="text-xs text-slate-500 uppercase tracking-wide">
            Visibility
          </Label>
          {editing ? (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(VISIBILITY_LABELS).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      visibility: val as TrailEditValues['visibility'],
                    }))
                  }
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer
                    ${
                      form.visibility === val
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <InfoBadge>
              {VISIBILITY_LABELS[currentTrail?.visibility ?? ''] ??
                currentTrail?.visibility ??
                '—'}
            </InfoBadge>
          )}
        </div>
        {/* ── Save error ────────────────────────────────────────────────── */}
        {saveError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {saveError}
          </p>
        )}
        {/* ── Action buttons ────────────────────────────────────────────── */}
        {editing && (
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleCancelEdit}
              disabled={saving || deleting}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white"
              onClick={handleSave}
              disabled={saving || deleting}
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  Save
                </>
              )}
            </Button>
          </div>
        )}
        {/* ── Delete button ─────────────────────────────────────────────── */}
        {editing && !isNew && canDelete && (
          <div className="pt-1">
            <Button
              variant="outline"
              className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
              onClick={handleDelete}
              disabled={saving || deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Delete Trail
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

// ── EditModeToggle ────────────────────────────────────────────────────────────

interface EditModeToggleProps {
  drawApi: DrawTrailApi;
  canEdit: boolean;
  /** True when a committed LineString (≥2 coords) exists */
  hasGeometry: boolean;
  /** Called when the user clicks Cancel — discards geometry changes */
  onCancel: () => void;
  /** Called when the user clicks Done — enters preview mode */
  onDone: () => void;
  /** Called when the user clicks Save (preview mode) — persists to DB */
  onSave: () => void;
  /**
   * Called when the user clicks Draw/Drawing…/Moving….
   * If no draw control is active yet (new trail, no geometry), caller should
   * call activateCreate() here instead of toggleDraw().
   */
  onDrawClick: () => void;
}

function EditModeToggle({
  drawApi,
  canEdit,
  hasGeometry,
  onCancel,
  onDone,
  onSave,
  onDrawClick,
}: EditModeToggleProps) {
  const isDrawActive = drawApi.isEditing && drawApi.drawMode === 'draw';
  const isPreview = drawApi.isEditing && drawApi.drawMode === 'preview';

  const btnBase =
    'flex flex-1 items-center justify-center gap-1.5 py-1 text-xs font-medium rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const activeStyle = 'bg-slate-800 text-white shadow-sm';
  const inactiveStyle =
    'text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed';

  if (!drawApi.isEditing) {
    // Not editing — show a single Edit button
    return (
      <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5 mx-4 mb-2">
        <button
          type="button"
          className={`${btnBase} ${inactiveStyle}`}
          onClick={onDrawClick}
          disabled={!canEdit}
          title={
            !canEdit
              ? 'Editing requires admin role'
              : hasGeometry
                ? 'Edit — adjust vertices'
                : 'Draw — place waypoints'
          }
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
      </div>
    );
  }

  if (isPreview) {
    // Preview — show Re-edit · Save + Snap indicator
    return (
      <div className="flex flex-col gap-1 mx-4 mb-2">
        <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
          {/* Cancel — discard all changes */}
          <button
            type="button"
            className={`${btnBase} text-red-600 hover:bg-red-50`}
            onClick={onCancel}
            title="Cancel — discard changes (Esc)"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>

          {/* Re-edit — go back into move mode */}
          <button
            type="button"
            className={`${btnBase} bg-slate-100 text-slate-700 font-medium`}
            onClick={onDrawClick}
            title="Re-edit — adjust the trail geometry"
          >
            <Pencil className="w-3.5 h-3.5" />
            Re-edit
          </button>

          {/* Save — commit to DB */}
          <button
            type="button"
            className={`${btnBase} text-green-700 hover:bg-green-50`}
            onClick={onSave}
            title="Save — commit to database"
          >
            <Check className="w-3.5 h-3.5" />
            Save
          </button>
        </div>
      </div>
    );
  }

  // Editing (draw or move) — show Cancel · Draw toggle · Done + Snap indicator
  return (
    <div className="flex flex-col gap-1 mx-4 mb-2">
      <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
        {/* Cancel — discard changes (Escape) */}
        <button
          type="button"
          className={`${btnBase} text-red-600 hover:bg-red-50`}
          onClick={onCancel}
          title="Cancel — discard changes (Esc)"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>

        {/* Draw toggle — draw ↔ move */}
        <button
          type="button"
          className={`${btnBase} ${isDrawActive ? activeStyle : 'bg-slate-100 text-slate-700 font-medium'}`}
          onClick={onDrawClick}
          title={
            isDrawActive
              ? 'Finish drawing → switch to move'
              : 'Switch to draw mode'
          }
        >
          <Pencil className="w-3.5 h-3.5" />
          {isDrawActive ? 'Drawing…' : 'Moving…'}
        </button>

        {/* Done — enter preview (Enter) */}
        <button
          type="button"
          className={`${btnBase} text-green-700 hover:bg-green-50`}
          onClick={onDone}
          title="Done — preview changes (Enter)"
        >
          <Check className="w-3.5 h-3.5" />
          Done
        </button>
      </div>

      {/* Snap indicator */}
      <div className="flex items-center justify-end px-1">
        <span
          className="flex items-center gap-1 text-[10px] text-slate-400 select-none"
          title="Press Space to toggle snap"
        >
          <Magnet className="w-3 h-3" />
          {drawApi.snapEnabled ? 'Snap ON' : 'Snap OFF'}
        </span>
      </div>
    </div>
  );
}

// ── Keyboard hint bar ─────────────────────────────────────────────────────────

function DrawHintBar({
  drawApi,
  mode,
}: {
  drawApi: DrawTrailApi;
  mode: 'draw' | 'move' | 'preview';
}) {
  if (mode === 'preview') {
    return (
      <div className="mx-4 mb-1 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
        <span className="font-medium">Trail ready.</span> Tap{' '}
        <span className="font-medium">Re-edit</span> to adjust, or{' '}
        <span className="font-medium">Save</span> to commit.
      </div>
    );
  }
  if (mode === 'draw') {
    return (
      <div className="mx-4 mb-1 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
        <span className="font-medium">Click to place waypoints.</span>{' '}
        <kbd className="font-mono bg-amber-100 px-0.5 rounded">Enter</kbd> or
        tap <span className="font-medium">Done</span> to finish.{' '}
        <kbd className="font-mono bg-amber-100 px-0.5 rounded">Esc</kbd> to
        cancel.{' '}
        <kbd className="font-mono bg-amber-100 px-0.5 rounded">Space</kbd>{' '}
        toggles snap ({drawApi.snapEnabled ? 'ON' : 'OFF'}).
      </div>
    );
  }
  return (
    <div className="mx-4 mb-1 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
      Drag vertices to adjust. Tap <span className="font-medium">Done</span> or{' '}
      press <kbd className="font-mono bg-amber-100 px-0.5 rounded">Enter</kbd>{' '}
      to finish.{' '}
      <kbd className="font-mono bg-amber-100 px-0.5 rounded">Shift+click</kbd>{' '}
      adds a vertex to the end (hold{' '}
      <kbd className="font-mono bg-amber-100 px-0.5 rounded">Alt</kbd> for the
      start). <kbd className="font-mono bg-amber-100 px-0.5 rounded">Esc</kbd>{' '}
      to cancel.{' '}
      <kbd className="font-mono bg-amber-100 px-0.5 rounded">Space</kbd> toggles
      snap ({drawApi.snapEnabled ? 'ON' : 'OFF'}).{' '}
      <kbd className="font-mono bg-amber-100 px-0.5 rounded">Delete</kbd>{' '}
      removes selected,{' '}
      <kbd className="font-mono bg-amber-100 px-0.5 rounded">Shift+Del</kbd>{' '}
      removes last.{' '}
      <kbd className="font-mono bg-amber-100 px-0.5 rounded">Ctrl+Z</kbd>/
      <kbd className="font-mono bg-amber-100 px-0.5 rounded">Ctrl+Y</kbd>{' '}
      undo/redo.
    </div>
  );
}

// ── Shell: reads URL param, finds trail, owns the Drawer open state ───────────

interface TrailDetailDrawerProps {
  trails: Trail[];
  onSave: (feature: TrailFeature) => Promise<Trail>;
  onDelete: (id: number) => Promise<void>;
  drawApi: DrawTrailApi;
  regionId: number | null;
  onClose?: () => void;
  onEditingTrailChange?: (id: number | null) => void;
}

export default function TrailDetailDrawer({
  trails,
  onSave,
  onDelete,
  drawApi,
  regionId,
  onClose: onCloseExternal,
  onEditingTrailChange,
}: TrailDetailDrawerProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const trailIdParam = searchParams.get('trailId');
  const selectedTrailId = trailIdParam ? Number(trailIdParam) : null;

  const isNewTrail = selectedTrailId === -1;

  const trail =
    selectedTrailId !== null && selectedTrailId !== -1
      ? (trails.find((t) => t.id === selectedTrailId) ?? null)
      : null;

  const open = trail !== null || isNewTrail;

  const { role } = useAuth();
  const canEdit = role !== null && EDIT_ROLES.includes(role);
  const canDelete = role !== null && DELETE_ROLES.includes(role);

  function navigateToTrail(id: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('trailId', String(id));
      return next;
    });
  }

  function closeDrawer() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('trailId');
      return next;
    });
    onCloseExternal?.();
  }

  return (
    <aside
      className={`absolute top-0 right-0 h-full w-96 bg-white border-l border-slate-200 shadow-xl
        flex flex-col overflow-hidden z-20
        transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <div className="flex-1 overflow-y-auto">
        {open && (
          <TrailPanel
            key={isNewTrail ? 'new' : String(trail?.id)}
            trail={isNewTrail ? null : trail}
            canEdit={canEdit}
            canDelete={canDelete}
            drawApi={drawApi}
            regionId={regionId}
            onClose={closeDrawer}
            onSave={onSave}
            onDelete={onDelete}
            onCreated={(saved) => navigateToTrail(saved.id)}
            onNavigateToTrail={navigateToTrail}
            onEditingTrailChange={onEditingTrailChange}
          />
        )}
      </div>
    </aside>
  );
}
