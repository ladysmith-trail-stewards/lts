import { useState } from 'react';
import * as v from 'valibot';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CollectionStyleSchema,
  type CollectionStyle,
  type StyleValue,
} from '@/lib/map/generalGeomStyle';
import type { GeneralGeomCollectionOption } from '@/hooks/useGeneralGeom';

// ── StyleValueEditor ──────────────────────────────────────────────────────────

type Mode = 'constant' | 'TYPE' | 'SUBTYPE';

interface StyleValueEditorProps {
  label: string;
  value: StyleValue | undefined;
  valueType: 'color' | 'number';
  /** All unique (type, subtype, label) rows in this collection. */
  featureRows: Array<{ type: string; subtype: string | null; label: string }>;
  onChange: (next: StyleValue | undefined) => void;
}

function StyleValueEditor({
  label,
  value,
  valueType,
  featureRows,
  onChange,
}: StyleValueEditorProps) {
  const mode: Mode = value?.mode ?? 'constant';
  const constantVal =
    value?.mode === 'constant'
      ? String(value.value)
      : valueType === 'color'
        ? '#000000'
        : '1';

  const currentMap: Record<string, string | number> =
    value?.mode === 'TYPE' || value?.mode === 'SUBTYPE'
      ? (value.map ?? {})
      : {};

  // Rows to show and how to derive the map key from each row.
  // Deduplicated by the map key so TYPE mode shows one row per unique type
  // value, and SUBTYPE mode shows one row per unique subtype value.
  const rows: Array<{
    key: string;
    type: string;
    subtype: string | null;
    label: string;
  }> = (() => {
    const seen = new Set<string>();
    const out: Array<{
      key: string;
      type: string;
      subtype: string | null;
      label: string;
    }> = [];
    if (mode === 'TYPE') {
      for (const r of featureRows) {
        if (!seen.has(r.type)) {
          seen.add(r.type);
          out.push({ key: r.type, type: r.type, subtype: null, label: r.type });
        }
      }
    } else if (mode === 'SUBTYPE') {
      for (const r of featureRows) {
        if (r.subtype != null && !seen.has(r.subtype)) {
          seen.add(r.subtype);
          out.push({
            key: r.subtype,
            type: r.type,
            subtype: r.subtype,
            label: r.subtype,
          });
        }
      }
    }
    return out;
  })();

  function handleModeChange(next: Mode) {
    if (next === 'TYPE') onChange({ mode: 'TYPE', map: currentMap });
    else if (next === 'SUBTYPE') onChange({ mode: 'SUBTYPE', map: currentMap });
    else
      onChange({
        mode: 'constant',
        value: valueType === 'number' ? Number(constantVal) : constantVal,
      });
  }

  function handleConstantChange(raw: string) {
    onChange({
      mode: 'constant',
      value: valueType === 'number' ? Number(raw) : raw,
    });
  }

  function handleMapChange(key: string, raw: string) {
    const val = valueType === 'number' ? Number(raw) : raw;
    const nextMap = { ...currentMap, [key]: val };
    if (value?.mode === 'TYPE') onChange({ mode: 'TYPE', map: nextMap });
    else onChange({ mode: 'SUBTYPE', map: nextMap });
  }

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_100px_auto] items-center gap-2">
        <Label className="text-xs text-slate-600">{label}</Label>
        <Select value={mode} onValueChange={(v) => handleModeChange(v as Mode)}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="constant">Constant</SelectItem>
            <SelectItem value="TYPE">Type A</SelectItem>
            <SelectItem value="SUBTYPE">Type B</SelectItem>
          </SelectContent>
        </Select>
        {mode === 'constant' ? (
          valueType === 'color' ? (
            <input
              type="color"
              value={constantVal}
              onChange={(e) => handleConstantChange(e.target.value)}
              className="w-8 h-7 rounded border border-input cursor-pointer p-0.5"
            />
          ) : (
            <Input
              type="number"
              value={constantVal}
              min={0}
              step={0.1}
              onChange={(e) => handleConstantChange(e.target.value)}
              className="h-7 text-xs w-16"
            />
          )
        ) : (
          <span />
        )}
      </div>

      {/* Per-value map when mode is TYPE or SUBTYPE */}
      {(mode === 'TYPE' || mode === 'SUBTYPE') && rows.length > 0 && (
        <div className="ml-2 space-y-1 border-l-2 border-slate-100 pl-3">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto] gap-2 text-[10px] font-medium text-slate-400 uppercase tracking-wide pb-0.5">
            <span>{mode === 'TYPE' ? 'Type A Value' : 'Type B Value'}</span>
            <span />
          </div>
          {rows.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_auto] items-center gap-2"
            >
              <span className="text-xs text-slate-600 truncate" title={row.key}>
                {row.key}
              </span>
              {valueType === 'color' ? (
                <input
                  type="color"
                  value={String(currentMap[row.key] ?? '#000000')}
                  onChange={(e) => handleMapChange(row.key, e.target.value)}
                  className="w-8 h-6 rounded border border-input cursor-pointer p-0.5 shrink-0"
                />
              ) : (
                <Input
                  type="number"
                  value={String(currentMap[row.key] ?? 1)}
                  min={0}
                  step={0.1}
                  onChange={(e) => handleMapChange(row.key, e.target.value)}
                  className="h-6 text-xs w-16 shrink-0"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {(mode === 'TYPE' || mode === 'SUBTYPE') && rows.length === 0 && (
        <p className="ml-2 text-xs text-slate-400 italic">No values found</p>
      )}
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

interface GeneralGeomStyleDialogProps {
  collection: GeneralGeomCollectionOption;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    collectionId: number,
    style: CollectionStyle,
    label: string
  ) => Promise<Error | null>;
}

export default function GeneralGeomStyleDialog({
  collection,
  open,
  onOpenChange,
  onSave,
}: GeneralGeomStyleDialogProps) {
  const [draft, setDraft] = useState<CollectionStyle>(() => ({
    ...collection.style,
  }));
  const [label, setLabel] = useState(collection.label);
  const [saving, setSaving] = useState(false);

  // Derive which geometry group this collection holds
  const fct = collection.featureCollectionType;
  const isLine = fct === 'LineString' || fct === 'MultiLineString';
  const isPoly = fct === 'Polygon' || fct === 'MultiPolygon';
  const isPoint = fct === 'Point' || fct === 'MultiPoint';

  // Reset draft when collection changes
  function handleOpenChange(next: boolean) {
    if (next) {
      setDraft({ ...collection.style });
      setLabel(collection.label);
    }
    onOpenChange(next);
  }

  function setLine<K extends keyof NonNullable<CollectionStyle['line']>>(
    key: K,
    val: StyleValue | undefined
  ) {
    setDraft((prev) => ({
      ...prev,
      line: { ...prev.line, [key]: val },
    }));
  }

  function setPolygon<K extends keyof NonNullable<CollectionStyle['polygon']>>(
    key: K,
    val: StyleValue | undefined
  ) {
    setDraft((prev) => ({
      ...prev,
      polygon: { ...prev.polygon, [key]: val },
    }));
  }

  function setPoint<K extends keyof NonNullable<CollectionStyle['point']>>(
    key: K,
    val: StyleValue | undefined
  ) {
    setDraft((prev) => ({
      ...prev,
      point: { ...prev.point, [key]: val },
    }));
  }

  async function handleSave() {
    // Strip keys irrelevant to this collection type before saving
    const relevant: CollectionStyle = {
      ...(isLine ? { line: draft.line } : {}),
      ...(isPoly ? { polygon: draft.polygon } : {}),
      ...(isPoint ? { point: draft.point } : {}),
    };
    const result = v.safeParse(CollectionStyleSchema, relevant);
    if (!result.success) {
      toast.error('Invalid style values');
      return;
    }
    setSaving(true);
    const err = await onSave(
      collection.id,
      result.output,
      label.trim() || collection.label
    );
    setSaving(false);
    if (err) {
      toast.error(`Failed to save style: ${err.message}`);
    } else {
      toast.success('Style saved');
      onOpenChange(false);
    }
  }

  // Shared props for every StyleValueEditor in this dialog
  const svProps = {
    featureRows: collection.featureRows,
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Edit Style — {collection.label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Collection name */}
          <div className="space-y-1">
            <Label className="text-xs text-slate-600">Collection Name</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="h-8 text-sm"
              placeholder="Collection name"
            />
          </div>

          {/* Lines */}
          {isLine && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Lines
              </p>
              <StyleValueEditor
                {...svProps}
                label="Color"
                value={draft.line?.color}
                valueType="color"
                onChange={(v) => setLine('color', v)}
              />
              <StyleValueEditor
                {...svProps}
                label="Width"
                value={draft.line?.width}
                valueType="number"
                onChange={(v) => setLine('width', v)}
              />
              <StyleValueEditor
                {...svProps}
                label="Opacity"
                value={draft.line?.opacity}
                valueType="number"
                onChange={(v) => setLine('opacity', v)}
              />
            </section>
          )}

          {/* Polygons */}
          {isPoly && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Polygons
              </p>
              <StyleValueEditor
                {...svProps}
                label="Fill Color"
                value={draft.polygon?.fillColor}
                valueType="color"
                onChange={(v) => setPolygon('fillColor', v)}
              />
              <StyleValueEditor
                {...svProps}
                label="Fill Opacity"
                value={draft.polygon?.fillOpacity}
                valueType="number"
                onChange={(v) => setPolygon('fillOpacity', v)}
              />
              <StyleValueEditor
                {...svProps}
                label="Outline Color"
                value={draft.polygon?.outlineColor}
                valueType="color"
                onChange={(v) => setPolygon('outlineColor', v)}
              />
            </section>
          )}

          {/* Points */}
          {isPoint && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Points
              </p>
              <StyleValueEditor
                {...svProps}
                label="Color"
                value={draft.point?.color}
                valueType="color"
                onChange={(v) => setPoint('color', v)}
              />
            </section>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
