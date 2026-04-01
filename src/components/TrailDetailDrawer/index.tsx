import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as v from 'valibot';
import { toast } from 'sonner';
import { X, Check, Loader2, Magnet, Pencil } from 'lucide-react';

import type { Trail } from '@/hooks/useTrails';
import type { DrawTrailApi } from '@/hooks/useDrawTrail';
import { supabase } from '@/lib/supabase/client';
import { upsertTrailsDb } from '@/lib/db_services/trails/upsertTrailsDb';
import { getTrailsDb } from '@/lib/db_services/trails/getTrailsDb';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/lib/supabase/database.types';

import {
  TrailEditSchema,
  type TrailEditValues,
  TRAIL_CLASS_LABELS,
  DIRECTION_LABELS,
  VISIBILITY_LABELS,
  ACTIVITY_OPTIONS,
} from './trailEditSchema';
import {
  trailToForm,
  extractFormErrors,
  formatDistance,
} from './trailEditHelpers';
import {
  TrailClassDot,
  InfoBadge,
  PillToggle,
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

// ── Inner panel (keyed by trail.id so all state resets on trail change) ───────

interface TrailPanelProps {
  trail: Trail;
  canEdit: boolean;
  drawApi: DrawTrailApi;
  onClose: () => void;
  onTrailUpdated: (updated: Trail) => void;
  onNavigateToTrail: (id: number) => void;
}

function TrailPanel({
  trail,
  canEdit,
  drawApi,
  onClose,
  onTrailUpdated,
  onNavigateToTrail,
}: TrailPanelProps) {
  // currentTrail is the live DB-backed copy; seeded from prop, refreshed on id change and after save
  const [currentTrail, setCurrentTrail] = useState<Trail>(trail);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Partial<Record<keyof TrailEditValues, string>>
  >({});
  const [form, setForm] = useState<TrailEditValues>(() => trailToForm(trail));

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
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [editing]);

  // Refetch from DB whenever the selected trail changes
  useEffect(() => {
    let cancelled = false;
    getTrailsDb(supabase, { ids: [trail.id] }).then(({ data }) => {
      const row = data?.[0];
      if (!cancelled && row) {
        const fresh = { ...trail, ...row } as unknown as Trail;
        setCurrentTrail(fresh);
        setForm(trailToForm(fresh));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [trail.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleStartEdit() {
    drawApi.activateEdit(currentTrail.geometry_geojson, {
      // Clicking empty map does nothing — only Save/Cancel can exit
      onClickNoTarget: () => {
        /* locked */
      },
      // Clicking another trail asks to confirm before navigating
      onClickOtherTrail: (id) => {
        if (
          window.confirm('Cancel your unsaved edits and switch to this trail?')
        ) {
          drawApiRef.current.deactivateEdit();
          setEditing(false);
          onNavigateToTrail(id);
        }
      },
    });
    setEditing(true);
  }

  function handleActivityToggle(value: string) {
    setForm((f) => ({
      ...f,
      activity_types: f.activity_types.includes(value)
        ? f.activity_types.filter((a) => a !== value)
        : [...f.activity_types, value],
    }));
  }

  async function handleSave() {
    const result = v.safeParse(TrailEditSchema, form);
    if (!result.success) {
      setValidationErrors(extractFormErrors(result.issues));
      return;
    }
    setValidationErrors({});
    setSaving(true);
    setSaveError(null);

    type LineStringGeometry = {
      type: 'LineString';
      coordinates: [number, number][];
    };

    const geometry: LineStringGeometry =
      (drawApi.getCurrentGeometry() as LineStringGeometry | null) ??
      (currentTrail.geometry_geojson as LineStringGeometry);

    const { allOk, error } = await upsertTrailsDb(supabase, {
      type: 'Feature',
      geometry,
      properties: {
        id: currentTrail.id,
        name: result.output.name,
        description: result.output.description ?? null,
        trail_class: result.output.trail_class,
        direction: result.output.direction,
        activity_types: result.output.activity_types,
        planned: result.output.planned,
        connector: result.output.connector,
        visibility: result.output.visibility,
        region_id: currentTrail.region_id,
        type: currentTrail.type,
      },
    });

    setSaving(false);

    if (error || !allOk) {
      setSaveError(error?.message ?? 'Save failed. Check your permissions.');
      return;
    }

    drawApi.deactivateEdit();

    const updated: Trail = {
      ...currentTrail,
      name: result.output.name,
      description: result.output.description ?? null,
      trail_class: result.output.trail_class,
      direction: result.output.direction,
      activity_types: result.output.activity_types,
      planned: result.output.planned,
      connector: result.output.connector,
      visibility: result.output.visibility,
    };
    setCurrentTrail(updated);
    onTrailUpdated(updated);
    setForm(trailToForm(updated));
    setEditing(false);
    toast.success(`"${updated.name}" saved successfully.`);
  }

  function handleCancelEdit() {
    if (
      drawApi.isDirty &&
      !window.confirm('Discard geometry changes and cancel editing?')
    ) {
      return;
    }
    drawApi.deactivateEdit();
    setForm(trailToForm(currentTrail));
    setEditing(false);
    setSaveError(null);
    setValidationErrors({});
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
              {currentTrail.name}
            </h2>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canEdit && !editing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleStartEdit}
              title="Edit trail"
            >
              <Pencil className="w-4 h-4" />
            </Button>
          )}
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

      {editing && (
        <div className="mx-4 mb-1 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
          <Magnet className="w-3.5 h-3.5 shrink-0" />
          <span>
            Drag vertices on the map to edit the trail geometry.{' '}
            <span className="font-medium">
              Snap: {drawApi.snapEnabled ? 'ON' : 'OFF'}
            </span>{' '}
            — press{' '}
            <kbd className="font-mono bg-amber-100 px-0.5 rounded">Space</kbd>{' '}
            to toggle.{' '}
            <kbd className="font-mono bg-amber-100 px-0.5 rounded">Delete</kbd>{' '}
            removes selected vertex,{' '}
            <kbd className="font-mono bg-amber-100 px-0.5 rounded">
              Shift+Del
            </kbd>{' '}
            removes last.{' '}
            <kbd className="font-mono bg-amber-100 px-0.5 rounded">Ctrl+Z</kbd>/
            <kbd className="font-mono bg-amber-100 px-0.5 rounded">Ctrl+Y</kbd>{' '}
            undo/redo.
          </span>
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="px-4 pb-6 space-y-5">
        {/* ── Stats ─────────────────────────────────────────────────────── */}
        <div className="flex gap-2">
          {/* Distance */}
          <div className="border rounded-lg p-2 text-center text-xs text-slate-500 w-20 shrink-0 flex flex-col justify-center">
            <div className="font-semibold text-slate-700 text-sm">
              {formatDistance(currentTrail.distance_m)}
            </div>
            <div>Distance</div>
          </div>
          {/* Elevation */}
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
          {/* TF Score */}
          <div className="border rounded-lg p-2 text-center text-xs text-slate-500 w-20 shrink-0 flex flex-col justify-center">
            <div className="font-semibold text-slate-700 text-sm">
              {currentTrail.tf_popularity ?? '—'}
            </div>
            <div>TF Score</div>
          </div>
        </div>
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
              {currentTrail.description ?? (
                <span className="text-slate-400">—</span>
              )}
            </p>
          )}
        </div>
        {/* ── Rating ────────────────────────────────────────────────────── */}{' '}
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
              <TrailClassDot trailClass={currentTrail.trail_class} />
              <span className="text-sm text-slate-700">
                {TRAIL_CLASS_LABELS[currentTrail.trail_class ?? ''] ??
                  currentTrail.trail_class ??
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
              {DIRECTION_LABELS[currentTrail.direction ?? ''] ??
                currentTrail.direction ??
                '—'}
            </span>
          )}
        </div>
        {/* ── Trail Type (activity_types) ───────────────────────────────── */}
        <div className="space-y-2">
          <Label className="text-xs text-slate-500 uppercase tracking-wide">
            Trail Type
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {editing ? (
              ACTIVITY_OPTIONS.map(({ value, label }) => (
                <PillToggle
                  key={value}
                  label={label}
                  checked={form.activity_types.includes(value)}
                  onChange={() => handleActivityToggle(value)}
                />
              ))
            ) : currentTrail.activity_types &&
              currentTrail.activity_types.length > 0 ? (
              currentTrail.activity_types.map((a) => (
                <InfoBadge key={a}>{a}</InfoBadge>
              ))
            ) : (
              <span className="text-sm text-slate-400">—</span>
            )}
          </div>
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
              <StatusPill on={currentTrail.planned} />
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
              <StatusPill on={currentTrail.connector} />
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
              {VISIBILITY_LABELS[currentTrail.visibility ?? ''] ??
                currentTrail.visibility ??
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
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white"
              onClick={handleSave}
              disabled={saving}
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
      </div>
    </>
  );
}

// ── New-trail default form values ─────────────────────────────────────────────

const NEW_TRAIL_DEFAULTS: TrailEditValues = {
  name: '',
  description: undefined,
  trail_class: 'TBD',
  direction: 'both',
  activity_types: [],
  planned: false,
  connector: false,
  visibility: 'public',
};

// ── NewTrailPanel — always in edit mode, sentinel id = -1 ─────────────────────

interface NewTrailPanelProps {
  drawApi: DrawTrailApi;
  onClose: () => void;
  onTrailCreated: (created: Trail) => void;
  regionId: number | null;
}

function NewTrailPanel({
  drawApi,
  onClose,
  onTrailCreated,
  regionId,
}: NewTrailPanelProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Partial<Record<keyof TrailEditValues, string>>
  >({});
  const [form, setForm] = useState<TrailEditValues>(NEW_TRAIL_DEFAULTS);

  const drawApiRef = useRef(drawApi);
  useEffect(() => {
    drawApiRef.current = drawApi;
  });

  // Deactivate draw when this panel unmounts
  useEffect(() => {
    return () => {
      if (drawApiRef.current.isEditing) {
        drawApiRef.current.deactivateEdit();
      }
    };
  }, []);

  // Guard browser close/refresh while drawing
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  function handleActivityToggle(value: string) {
    setForm((f) => ({
      ...f,
      activity_types: f.activity_types.includes(value)
        ? f.activity_types.filter((a) => a !== value)
        : [...f.activity_types, value],
    }));
  }

  async function handleSave() {
    const result = v.safeParse(TrailEditSchema, form);
    if (!result.success) {
      setValidationErrors(extractFormErrors(result.issues));
      return;
    }

    const geometry = drawApi.getCurrentGeometry();
    if (!geometry || geometry.coordinates.length < 2) {
      setSaveError('Draw at least two points on the map before saving.');
      return;
    }

    if (regionId === null) {
      setSaveError('No region is configured. Contact an administrator.');
      return;
    }

    setValidationErrors({});
    setSaving(true);
    setSaveError(null);

    const { results, allOk, error } = await upsertTrailsDb(supabase, {
      type: 'Feature',
      geometry: geometry as {
        type: 'LineString';
        coordinates: [number, number][];
      },
      properties: {
        name: result.output.name,
        description: result.output.description ?? null,
        trail_class: result.output.trail_class,
        direction: result.output.direction,
        activity_types: result.output.activity_types,
        planned: result.output.planned,
        connector: result.output.connector,
        visibility: result.output.visibility,
        region_id: regionId,
        type: 'trail',
      },
    });

    setSaving(false);

    if (error || !allOk || !results[0]?.id) {
      setSaveError(error?.message ?? 'Save failed. Check your permissions.');
      return;
    }

    drawApi.deactivateEdit();

    const created: Trail = {
      id: results[0].id,
      name: result.output.name,
      description: result.output.description ?? null,
      trail_class: result.output.trail_class,
      direction: result.output.direction,
      activity_types: result.output.activity_types,
      planned: result.output.planned,
      connector: result.output.connector,
      visibility: result.output.visibility,
      geometry_geojson: geometry as GeoJSON.LineString,
      distance_m: null,
      tf_popularity: null,
      region_id: regionId,
      type: 'trail',
      hidden: false,
      bike: false,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    toast.success(`"${created.name}" created successfully.`);
    onTrailCreated(created);
  }

  function handleCancel() {
    if (
      drawApi.isDirty &&
      !window.confirm('Discard the new trail and cancel?')
    ) {
      return;
    }
    drawApi.deactivateEdit();
    onClose();
  }

  const isDrawing = drawApi.isCreating && !drawApi.isDirty;

  return (
    <>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-row items-start justify-between gap-2 px-4 pt-4 pb-2">
        <div className="flex-1 min-w-0 space-y-1">
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="text-lg font-bold h-9"
            placeholder="Trail name"
            autoFocus
          />
          {validationErrors.name && (
            <p className="text-xs text-red-500">{validationErrors.name}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleCancel}
          title="Cancel"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* ── Draw hint / snap banner ──────────────────────────────────────── */}
      <div className="mx-4 mb-1 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
        <Magnet className="w-3.5 h-3.5 shrink-0" />
        {isDrawing ? (
          <span>
            <span className="font-medium">
              Click on the map to place waypoints.
            </span>{' '}
            Press{' '}
            <kbd className="font-mono bg-amber-100 px-0.5 rounded">Enter</kbd>{' '}
            or right-click to finish.{' '}
            <span className="font-medium">
              Snap: {drawApi.snapEnabled ? 'ON' : 'OFF'}
            </span>{' '}
            — <kbd className="font-mono bg-amber-100 px-0.5 rounded">Space</kbd>{' '}
            to toggle.
          </span>
        ) : (
          <span>
            Drag vertices to adjust.{' '}
            <span className="font-medium">
              Snap: {drawApi.snapEnabled ? 'ON' : 'OFF'}
            </span>{' '}
            — press{' '}
            <kbd className="font-mono bg-amber-100 px-0.5 rounded">Space</kbd>{' '}
            to toggle.{' '}
            <kbd className="font-mono bg-amber-100 px-0.5 rounded">Delete</kbd>{' '}
            removes selected,{' '}
            <kbd className="font-mono bg-amber-100 px-0.5 rounded">
              Shift+Del
            </kbd>{' '}
            removes last.{' '}
            <kbd className="font-mono bg-amber-100 px-0.5 rounded">Ctrl+Z</kbd>/
            <kbd className="font-mono bg-amber-100 px-0.5 rounded">Ctrl+Y</kbd>{' '}
            undo/redo.
          </span>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="px-4 pb-6 space-y-5">
        {/* ── Description ─────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500 uppercase tracking-wide">
            Description
          </Label>
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
        </div>

        {/* ── Rating ──────────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500 uppercase tracking-wide">
            Rating
          </Label>
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
        </div>

        {/* ── Direction ───────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500 uppercase tracking-wide">
            Direction
          </Label>
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
        </div>

        {/* ── Trail Type ──────────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label className="text-xs text-slate-500 uppercase tracking-wide">
            Trail Type
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITY_OPTIONS.map(({ value, label }) => (
              <PillToggle
                key={value}
                label={label}
                checked={form.activity_types.includes(value)}
                onChange={() => handleActivityToggle(value)}
              />
            ))}
          </div>
        </div>

        {/* ── Planning / Connector ────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Planning?</Label>
            <Switch
              checked={form.planned}
              onCheckedChange={(val) =>
                setForm((f) => ({ ...f, planned: val }))
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Connector?</Label>
            <Switch
              checked={form.connector}
              onCheckedChange={(val) =>
                setForm((f) => ({ ...f, connector: val }))
              }
            />
          </div>
        </div>

        {/* ── Visibility ──────────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label className="text-xs text-slate-500 uppercase tracking-wide">
            Visibility
          </Label>
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
        </div>

        {/* ── Save error ───────────────────────────────────────────────── */}
        {saveError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {saveError}
          </p>
        )}

        {/* ── Action buttons ───────────────────────────────────────────── */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-white"
            onClick={handleSave}
            disabled={saving || isDrawing}
            title={
              isDrawing
                ? 'Finish drawing the trail on the map first'
                : undefined
            }
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
      </div>
    </>
  );
}

// ── Shell: reads URL param, finds trail, owns the Drawer open state ───────────

interface TrailDetailDrawerProps {
  trails: Trail[];
  onTrailUpdated: (updated: Trail) => void;
  onTrailCreated: (created: Trail) => void;
  drawApi: DrawTrailApi;
  regionId: number | null;
  onClose?: () => void;
}

export default function TrailDetailDrawer({
  trails,
  onTrailUpdated,
  onTrailCreated,
  drawApi,
  regionId,
  onClose: onCloseExternal,
}: TrailDetailDrawerProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const trailIdParam = searchParams.get('trailId');
  const selectedTrailId = trailIdParam ? Number(trailIdParam) : null;

  const trail = selectedTrailId
    ? (trails.find((t) => t.id === selectedTrailId) ?? null)
    : null;

  // The drawer is open if a trail is selected OR if we're actively creating a new trail
  const isCreating = drawApi.isCreating;
  const open = trail !== null || isCreating;

  // ── Auth / role ──────────────────────────────────────────────────────────
  const { role } = useAuth();
  const canEdit = role !== null && EDIT_ROLES.includes(role);

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

  function handleTrailCreated(created: Trail) {
    onTrailCreated(created);
    navigateToTrail(created.id);
  }

  return (
    <aside
      className={`absolute top-0 right-0 h-full w-96 bg-white border-l border-slate-200 shadow-xl
        flex flex-col overflow-hidden z-20
        transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <div className="flex-1 overflow-y-auto">
        {/* New trail panel — visible while drawApi.isCreating */}
        {isCreating && !trail && (
          <NewTrailPanel
            drawApi={drawApi}
            regionId={regionId}
            onClose={closeDrawer}
            onTrailCreated={handleTrailCreated}
          />
        )}
        {/* key={trail.id} resets all inner state when the selected trail changes */}
        {trail && (
          <TrailPanel
            key={trail.id}
            trail={trail}
            canEdit={canEdit}
            drawApi={drawApi}
            onClose={closeDrawer}
            onTrailUpdated={onTrailUpdated}
            onNavigateToTrail={navigateToTrail}
          />
        )}
      </div>
    </aside>
  );
}
