import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as v from 'valibot';
import { toast } from 'sonner';
import { Pencil, X, Check, Loader2 } from 'lucide-react';

import type { Trail } from '@/hooks/useTrails';
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
import { trailToForm, extractFormErrors } from './trailEditHelpers';
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
  onClose: () => void;
  onTrailUpdated: (updated: Trail) => void;
}

function TrailPanel({
  trail,
  canEdit,
  onClose,
  onTrailUpdated,
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

  // Refetch from DB whenever the selected trail changes
  useEffect(() => {
    let cancelled = false;
    getTrailsDb(supabase, { ids: [trail.id] }).then(({ data }) => {
      const row = data?.[0];
      if (!cancelled && row) {
        const fresh = { ...trail, ...row } as Trail;
        setCurrentTrail(fresh);
        setForm(trailToForm(fresh));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [trail.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const { allOk, error } = await upsertTrailsDb(supabase, {
      type: 'Feature',
      geometry: currentTrail.geometry as {
        type: 'LineString';
        coordinates: [number, number][];
      },
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
              onClick={() => setEditing(true)}
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

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="px-4 pb-6 space-y-5">
        {/* ── Stats ─────────────────────────────────────────────────────── */}
        <div className="flex gap-2">
          {/* Distance */}
          <div className="border rounded-lg p-2 text-center text-xs text-slate-500 w-16 shrink-0 flex flex-col justify-center">
            <div className="font-semibold text-slate-700 text-sm">—</div>
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
          <div className="border rounded-lg p-2 text-center text-xs text-slate-500 w-16 shrink-0 flex flex-col justify-center">
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

// ── Shell: reads URL param, finds trail, owns the Drawer open state ───────────

interface TrailDetailDrawerProps {
  trails: Trail[];
  onTrailUpdated: (updated: Trail) => void;
}

export default function TrailDetailDrawer({
  trails,
  onTrailUpdated,
}: TrailDetailDrawerProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const trailIdParam = searchParams.get('trailId');
  const selectedTrailId = trailIdParam ? Number(trailIdParam) : null;

  const trail = selectedTrailId
    ? (trails.find((t) => t.id === selectedTrailId) ?? null)
    : null;

  const open = trail !== null;

  // ── Auth / role ──────────────────────────────────────────────────────────
  const { role } = useAuth();
  const canEdit = role !== null && EDIT_ROLES.includes(role);

  function closeDrawer() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('trailId');
      return next;
    });
  }

  return (
    <aside
      className={`absolute top-0 right-0 h-full w-80 bg-white border-l border-slate-200 shadow-xl
        flex flex-col overflow-hidden z-20
        transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <div className="flex-1 overflow-y-auto">
        {/* key={trail.id} resets all inner state when the selected trail changes */}
        {trail && (
          <TrailPanel
            key={trail.id}
            trail={trail}
            canEdit={canEdit}
            onClose={closeDrawer}
            onTrailUpdated={onTrailUpdated}
          />
        )}
      </div>
    </aside>
  );
}
