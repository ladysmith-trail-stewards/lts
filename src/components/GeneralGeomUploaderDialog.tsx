import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  FileUploadIcon,
  AlertCircleIcon,
  Tick02Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';
import {
  parseFiles,
  GEO_FILE_FORMAT_EXTENSIONS,
  type PendingItem,
  type UploaderConfig,
  type RawFeature,
} from '@/lib/geoUploader';
import * as v from 'valibot';
import {
  importGeneralGeomCollectionDb,
  type GeneralGeomFeatureImportMapper,
} from '@/lib/db_services/general_geom/importGeneralGeomCollectionDb';
import {
  DEFAULT_GENERAL_GEOM_MAPPER,
  listMapperFields,
  mapFeatureLabel,
  type GeneralGeomRawFeature,
} from '@/lib/uploaderConfigs/generalGeomMapper';
import {
  GeneralGeomCollectionInputSchema,
  MappedFeaturePropsSchema,
} from '@/lib/uploaderConfigs/generalGeomSchema';
import {
  getRegionsDb,
  type RegionRecordMeta,
} from '@/lib/db_services/regions/getRegionsDb';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import GeneralGeomMapperSection from '@/components/GeneralGeomMapperSection';
import { GEOM_GROUP_META } from '@/lib/geomTypeMeta';

type UploadStatus = 'idle' | 'parsing' | 'review' | 'uploading' | 'done';

type GeneralGeomRecord = GeoJSON.Feature;

type MappedUploadFeature = {
  key: string;
  collectionLabelBase: string;
  geomType: string;
  feature: GeoJSON.Feature;
};

const baseConfig: UploaderConfig<GeneralGeomRecord> = {
  title: 'Upload General Geometry',
  formats: ['geojson', 'gpx', 'kml'],
  geometryType: 'Any',
  regionBased: false,
  noun: 'feature',
  mapFeature: (raw: RawFeature) => {
    const label =
      (raw.properties.name as string | undefined) ??
      (raw.properties.title as string | undefined) ??
      raw.sourceFile.replace(/\.[^.]+$/, '');

    return {
      label,
      record: {
        type: 'Feature',
        geometry: raw.geometry,
        properties: raw.properties,
      },
    };
  },
  submit: async () => [],
};

const GEOM_GROUP_ORDER = [
  'Point',
  'LineString',
  'Polygon',
  'Geometry',
] as const;

export interface GeneralGeomUploaderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded?: (count: number) => void;
}

export default function GeneralGeomUploaderDialog({
  open,
  onOpenChange,
  onUploaded,
}: GeneralGeomUploaderDialogProps) {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [pending, setPending] = useState<PendingItem<GeneralGeomRecord>[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [regions, setRegions] = useState<RegionRecordMeta[]>([]);
  const [regionId, setRegionId] = useState<number | null>(null);
  const [epsg, setEpsg] = useState(4326);
  const [collectionLabelFallback, setCollectionLabelFallback] =
    useState('Imported Geometry');
  const [collectionDescription, setCollectionDescription] = useState('');
  const [collectionVisibility, setCollectionVisibility] = useState<
    'public' | 'private' | 'shared'
  >('public');
  const [mapper, setMapper] = useState<GeneralGeomFeatureImportMapper>(
    DEFAULT_GENERAL_GEOM_MAPPER
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      getRegionsDb(supabase, { metaOnly: true }).then(({ data }) => {
        if (data) setRegions(data);
      });
    }
  }, [open]);

  // Re-derive feature labels whenever the mapper changes (label field / fallback / suffix).
  useEffect(() => {
    if (status !== 'review') return;
    setPending((prev) =>
      prev.map((item, index) => {
        const feature: GeneralGeomRawFeature = {
          geometry: item.record.geometry,
          properties: (item.record.properties ?? {}) as Record<string, unknown>,
        };
        return { ...item, label: mapFeatureLabel(feature, mapper, index) };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapper]);

  const mapperFields = useMemo(() => {
    return listMapperFields(
      pending.map((item) => ({
        geometry: item.record.geometry,
        properties: (item.record.properties ?? {}) as Record<string, unknown>,
      }))
    );
  }, [pending]);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      setStatus('parsing');
      setWarnings([]);

      const { items, warnings: fileWarnings } = await parseFiles(
        fileArray,
        baseConfig,
        null
      );

      if (items.length === 0) {
        setWarnings([
          ...fileWarnings,
          'No valid geometries found in uploaded files.',
        ]);
        setStatus('idle');
        return;
      }

      const mappedItems = items.map((item, index) => {
        const feature: GeneralGeomRawFeature = {
          geometry: item.record.geometry,
          properties: (item.record.properties ?? {}) as Record<string, unknown>,
        };

        return {
          ...item,
          label: mapFeatureLabel(feature, mapper, index),
        };
      });

      setPending(mappedItems);
      setWarnings(fileWarnings);
      setStatus('review');
    },
    [mapper]
  );

  const handleUpload = useCallback(async () => {
    // Validate collection-level inputs with Valibot.
    const collectionResult = v.safeParse(GeneralGeomCollectionInputSchema, {
      label: collectionLabelFallback,
      description: collectionDescription || null,
      visibility: collectionVisibility,
      feature_collection_type: 'Geometry', // set per-group below
      region_id: regionId,
    });

    if (!collectionResult.success) {
      const issues = collectionResult.issues.map((i) => i.message);
      setWarnings(issues);
      toast.error(issues[0]);
      return;
    }

    const mapped = mapPendingFeatures({
      pending,
      mapper,
      collectionLabelFallback,
    });

    if (!mapped.ok) {
      setWarnings(mapped.errors);
      toast.error(
        'Mapped data is missing required values. Fix mapping and try again.'
      );
      setStatus('review');
      return;
    }

    setStatus('uploading');

    const resultByKey = new Map<
      string,
      { ok: boolean; message: string | null }
    >();
    let totalSuccess = 0;

    const byCollectionLabel = new Map<string, Set<string>>();
    for (const item of mapped.items) {
      const existing =
        byCollectionLabel.get(item.collectionLabelBase) ?? new Set<string>();
      existing.add(item.geomType);
      byCollectionLabel.set(item.collectionLabelBase, existing);
    }

    const grouped = new Map<string, MappedUploadFeature[]>();
    for (const item of mapped.items) {
      const key = `${item.collectionLabelBase}::${item.geomType}`;
      const existing = grouped.get(key) ?? [];
      existing.push(item);
      grouped.set(key, existing);
    }

    for (const [groupKey, items] of grouped.entries()) {
      const [collectionLabelBase, geomType] = groupKey.split('::');
      const isMixed =
        (byCollectionLabel.get(collectionLabelBase)?.size ?? 0) > 1;
      const collectionLabel = isMixed
        ? `${collectionLabelBase} (${geomType})`
        : collectionLabelBase;

      const { results, error } = await importGeneralGeomCollectionDb(supabase, {
        collection: {
          label: collectionLabel,
          description: collectionDescription || null,
          visibility: collectionVisibility,
          feature_collection_type: geomType,
          region_id: regionId,
        },
        features: items.map((item) => item.feature),
        sourceEpsg: epsg,
      });

      if (error) {
        for (const item of items) {
          resultByKey.set(item.key, { ok: false, message: error.message });
        }
        continue;
      }

      for (let i = 0; i < items.length; i++) {
        const row = results[i] ?? { ok: false, message: 'No result returned' };
        resultByKey.set(items[i].key, {
          ok: row.ok,
          message: row.message ?? null,
        });
        if (row.ok) totalSuccess += 1;
      }
    }

    setPending((prev) =>
      prev.map((item) => ({
        ...item,
        result: resultByKey.get(item.key) ?? {
          ok: false,
          message: 'Upload failed',
        },
      }))
    );

    setStatus('done');

    if (totalSuccess === pending.length) {
      toast.success(`${totalSuccess} features uploaded successfully.`);
    } else {
      toast.warning(
        `${totalSuccess} of ${pending.length} features uploaded. Check results for errors.`
      );
    }

    if (totalSuccess > 0) onUploaded?.(totalSuccess);
  }, [
    collectionDescription,
    collectionLabelFallback,
    collectionVisibility,
    epsg,
    mapper,
    onUploaded,
    pending,
    regionId,
  ]);

  const reset = useCallback(() => {
    setStatus('idle');
    setPending([]);
    setWarnings([]);
    setRegionId(null);
  }, []);

  const updateMapperField = useCallback(
    (
      section: keyof GeneralGeomFeatureImportMapper,
      key: string,
      value: string | boolean
    ) => {
      setMapper((prev) => ({
        ...prev,
        [section]: {
          ...prev[section],
          [key]: value,
        },
      }));
    },
    []
  );

  const updateLabel = useCallback((key: string, label: string) => {
    setPending((prev) =>
      prev.map((item) => (item.key === key ? { ...item, label } : item))
    );
  }, []);

  const removeItem = useCallback((key: string) => {
    setPending((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const canUpload =
    status === 'review' && pending.length > 0 && regionId !== null;

  const acceptAttr = baseConfig.formats
    .flatMap((f) => GEO_FILE_FORMAT_EXTENSIONS[f])
    .join(',');

  const supportedLabel = baseConfig.formats
    .flatMap((f) => GEO_FILE_FORMAT_EXTENSIONS[f])
    .join(', ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Upload General Geometry</DialogTitle>
          <DialogDescription>
            Import points, lines, and polygons using GeoJSON, GPX, or KML.
          </DialogDescription>
        </DialogHeader>

        {(status === 'idle' || status === 'parsing') && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Drop zone for geo files"
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors',
              isDragging
                ? 'border-ring bg-ring/10'
                : 'border-border hover:border-ring/60 hover:bg-muted/40'
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              processFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) =>
              e.key === 'Enter' && fileInputRef.current?.click()
            }
          >
            <HugeiconsIcon
              icon={FileUploadIcon}
              className="size-10 text-muted-foreground"
              strokeWidth={1.5}
            />
            <div>
              <p className="font-medium text-sm">
                {status === 'parsing'
                  ? 'Parsing files…'
                  : 'Drop files here or click to browse'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supported: {supportedLabel}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptAttr}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) processFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {warnings.length > 0 && (
          <ul className="flex flex-col gap-1">
            {warnings.map((warning, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400"
              >
                <HugeiconsIcon
                  icon={AlertCircleIcon}
                  className="size-4 mt-px shrink-0"
                  strokeWidth={2}
                />
                {warning}
              </li>
            ))}
          </ul>
        )}

        {(status === 'review' || status === 'uploading' || status === 'done') &&
          pending.length > 0 && (
            <div className="grid md:grid-cols-[2fr_1fr] gap-4 flex-1 min-h-0 overflow-hidden">
              <div className="space-y-3 overflow-y-auto pr-1">
                <h3 className="text-sm font-medium">Collection Mapping</h3>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Collection name
                  </p>
                  <Input
                    value={collectionLabelFallback}
                    onChange={(e) => setCollectionLabelFallback(e.target.value)}
                    placeholder="e.g. Imported Geometry"
                    disabled={status !== 'review'}
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Collection description
                  </p>
                  <Input
                    value={collectionDescription}
                    onChange={(e) => setCollectionDescription(e.target.value)}
                    placeholder="Optional"
                    disabled={status !== 'review'}
                  />
                </div>

                {/* Region · Visibility · EPSG on one row */}
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Region <span className="text-red-500">*</span>
                    </p>
                    <Select
                      value={regionId !== null ? String(regionId) : ''}
                      onValueChange={(v) => setRegionId(Number(v))}
                      disabled={status !== 'review'}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select region…">
                          {regionId !== null
                            ? (regions.find((r) => r.id === regionId)?.name ??
                              '')
                            : null}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {regions.map((r) => (
                          <SelectItem key={r.id} value={String(r.id)}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">Visibility</p>
                    <Select
                      value={collectionVisibility}
                      onValueChange={(v) =>
                        setCollectionVisibility(
                          (v ?? 'public') as 'public' | 'private' | 'shared'
                        )
                      }
                      disabled={status !== 'review'}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Visibility" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">Public</SelectItem>
                        <SelectItem value="private">Private</SelectItem>
                        <SelectItem value="shared">Shared</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">EPSG</p>
                    <Input
                      type="number"
                      value={epsg}
                      onChange={(e) => setEpsg(Number(e.target.value) || 4326)}
                      disabled={status !== 'review'}
                      placeholder="4326"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <h3 className="text-sm font-medium">Feature Mapper</h3>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                    disabled={status !== 'review'}
                    onClick={() => setMapper(DEFAULT_GENERAL_GEOM_MAPPER)}
                  >
                    Reset mapper
                  </button>
                </div>

                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="text-left text-[10px] font-normal text-muted-foreground/60 pb-1 w-24">
                        Target
                      </th>
                      <th className="text-left text-[10px] font-normal text-muted-foreground/60 pb-1 pr-2">
                        Input parameter
                      </th>
                      <th className="text-left text-[10px] font-normal text-muted-foreground/60 pb-1">
                        Fallback
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <GeneralGeomMapperSection
                      label="Label"
                      fields={mapperFields}
                      fieldValue={mapper.label.field}
                      fallbackValue={mapper.label.fallback}
                      fallbackPlaceholder="Optional"
                      disabled={status !== 'review'}
                      onFieldChange={(value) =>
                        updateMapperField('label', 'field', value)
                      }
                      onFallbackChange={(value) =>
                        updateMapperField('label', 'fallback', value)
                      }
                    />

                    {!mapper.label.field && (
                      <tr>
                        <td className="py-1.5 pr-3 text-sm font-medium whitespace-nowrap align-middle w-24 text-muted-foreground">
                          Label Suffix
                        </td>
                        <td className="py-1.5 pr-2 align-middle">
                          <Input
                            value={mapper.label.auto_increment_suffix}
                            onChange={(e) =>
                              updateMapperField(
                                'label',
                                'auto_increment_suffix',
                                e.target.value
                              )
                            }
                            disabled={status !== 'review'}
                            placeholder="e.g. feat"
                            className="h-8 text-sm"
                          />
                        </td>
                        <td className="py-1.5 align-middle text-xs text-muted-foreground/60 whitespace-nowrap">
                          →{' '}
                          {(
                            mapper.label.auto_increment_suffix || 'feat'
                          ).trim()}
                          -1, …
                        </td>
                      </tr>
                    )}

                    <GeneralGeomMapperSection
                      label="Description"
                      fields={mapperFields}
                      fieldValue={mapper.description.field}
                      fallbackValue={mapper.description.fallback}
                      fallbackPlaceholder="Optional"
                      disabled={status !== 'review'}
                      onFieldChange={(value) =>
                        updateMapperField('description', 'field', value)
                      }
                      onFallbackChange={(value) =>
                        updateMapperField('description', 'fallback', value)
                      }
                    />

                    <GeneralGeomMapperSection
                      label="Type"
                      fields={mapperFields}
                      fieldValue={mapper.type.field}
                      fallbackValue={mapper.type.fallback}
                      fallbackPlaceholder="e.g. feature"
                      disabled={status !== 'review'}
                      onFieldChange={(value) =>
                        updateMapperField('type', 'field', value)
                      }
                      onFallbackChange={(value) =>
                        updateMapperField('type', 'fallback', value)
                      }
                    />

                    <GeneralGeomMapperSection
                      label="Subtype"
                      fields={mapperFields}
                      fieldValue={mapper.subtype.field}
                      fallbackValue={mapper.subtype.fallback}
                      fallbackPlaceholder="Optional"
                      disabled={status !== 'review'}
                      onFieldChange={(value) =>
                        updateMapperField('subtype', 'field', value)
                      }
                      onFallbackChange={(value) =>
                        updateMapperField('subtype', 'fallback', value)
                      }
                    />

                    <GeneralGeomMapperSection
                      label="Visibility"
                      fields={mapperFields}
                      fieldValue={mapper.visibility.field}
                      fallbackValue={mapper.visibility.fallback}
                      fallbackPlaceholder="public / private / shared"
                      disabled={status !== 'review'}
                      onFieldChange={(value) =>
                        updateMapperField('visibility', 'field', value)
                      }
                      onFallbackChange={(value) =>
                        updateMapperField('visibility', 'fallback', value)
                      }
                    />
                  </tbody>
                </table>

                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={mapper.description.include_props_json}
                    onCheckedChange={(checked) =>
                      updateMapperField(
                        'description',
                        'include_props_json',
                        checked === true
                      )
                    }
                    disabled={status !== 'review'}
                  />
                  Append all feature properties as stringified JSON to
                  description
                </label>
              </div>

              <div className="space-y-2 overflow-y-auto min-h-0">
                <h3 className="text-sm font-medium">
                  Review features ({pending.length})
                </h3>
                {GEOM_GROUP_ORDER.map((geomType) => {
                  const group = pending.filter(
                    (item) =>
                      geometryGroup(item.record.geometry.type) === geomType
                  );
                  if (group.length === 0) return null;
                  const { icon, label: groupLabel } = GEOM_GROUP_META[geomType];
                  return (
                    <div key={geomType} className="space-y-1">
                      <div className="flex items-center gap-1.5 pt-1">
                        <HugeiconsIcon
                          icon={icon}
                          className="size-3.5 text-muted-foreground shrink-0"
                          strokeWidth={2}
                        />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {groupLabel} ({group.length})
                        </span>
                      </div>
                      {group.map((item) => (
                        <li
                          key={item.key}
                          className="flex flex-col gap-1 rounded-xl bg-muted/40 px-3 py-2 text-sm list-none"
                        >
                          <div className="flex items-center gap-2">
                            {item.result ? (
                              item.result.ok ? (
                                <HugeiconsIcon
                                  icon={Tick02Icon}
                                  className="size-4 shrink-0 text-green-600"
                                  strokeWidth={2}
                                />
                              ) : (
                                <HugeiconsIcon
                                  icon={Cancel01Icon}
                                  className="size-4 shrink-0 text-destructive"
                                  strokeWidth={2}
                                />
                              )
                            ) : null}

                            <Input
                              value={item.label}
                              onChange={(e) =>
                                updateLabel(item.key, e.target.value)
                              }
                              disabled={status !== 'review'}
                              className="flex-1 h-8 text-sm"
                              placeholder="Label"
                            />

                            <Badge
                              variant="secondary"
                              className="shrink-0 tabular-nums"
                            >
                              {item.coordCount} pts
                            </Badge>

                            {!item.result && status === 'review' && (
                              <button
                                type="button"
                                aria-label="Remove item"
                                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => removeItem(item.key)}
                              >
                                <HugeiconsIcon
                                  icon={Cancel01Icon}
                                  className="size-4"
                                  strokeWidth={2}
                                />
                              </button>
                            )}
                          </div>

                          {item.result &&
                            !item.result.ok &&
                            item.result.message && (
                              <p className="text-xs text-destructive pl-6">
                                {item.result.message}
                              </p>
                            )}
                        </li>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        <DialogFooter showCloseButton={status !== 'uploading'}>
          {status === 'review' && (
            <>
              <Button variant="outline" size="sm" onClick={reset}>
                Reset
              </Button>
              <Button size="sm" onClick={handleUpload} disabled={!canUpload}>
                Upload {pending.length} features
              </Button>
            </>
          )}
          {status === 'uploading' && (
            <Button size="sm" disabled>
              Uploading…
            </Button>
          )}
          {status === 'done' && (
            <Button variant="outline" size="sm" onClick={reset}>
              Upload more
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function mapPendingFeatures(args: {
  pending: PendingItem<GeneralGeomRecord>[];
  mapper: GeneralGeomFeatureImportMapper;
  collectionLabelFallback: string;
}):
  | { ok: true; items: MappedUploadFeature[] }
  | { ok: false; errors: string[] } {
  const { pending, mapper, collectionLabelFallback } = args;
  const items: MappedUploadFeature[] = [];
  const errors: string[] = [];

  for (let index = 0; index < pending.length; index += 1) {
    const item = pending[index];
    const props = (item.record.properties ?? {}) as Record<string, unknown>;

    const rawVisibility = readMappedString(
      props,
      mapper.visibility.field,
      mapper.visibility.fallback
    );

    const collectionLabelBase = collectionLabelFallback;

    const subtype = readMappedString(
      props,
      mapper.subtype.field,
      mapper.subtype.fallback
    );
    const descriptionBase = readMappedString(
      props,
      mapper.description.field,
      mapper.description.fallback
    );
    const description = mapper.description.include_props_json
      ? [descriptionBase || null, JSON.stringify(props)]
          .filter(Boolean)
          .join('\n')
      : descriptionBase;

    // Validate mapped feature properties with Valibot.
    const featureProps = {
      type: readMappedString(props, mapper.type.field, mapper.type.fallback),
      subtype: subtype || null,
      visibility: rawVisibility,
      label: item.label.trim(),
      description: description || null,
    };

    const result = v.safeParse(MappedFeaturePropsSchema, featureProps);
    if (!result.success) {
      const label = item.label || `Feature ${index + 1}`;
      for (const issue of result.issues) {
        errors.push(`${label}: ${issue.message}`);
      }
      continue;
    }

    if (!collectionLabelBase) {
      errors.push(`${result.output.label}: Collection label is required.`);
      continue;
    }

    items.push({
      key: item.key,
      collectionLabelBase,
      geomType: geometryGroup(item.record.geometry.type),
      feature: {
        type: 'Feature',
        geometry: item.record.geometry,
        properties: result.output,
      },
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, items };
}

function readMappedString(
  props: Record<string, unknown>,
  field: string,
  fallback: string
): string {
  const value = field ? props[field] : undefined;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if ((typeof value === 'number' || typeof value === 'boolean') && field)
    return String(value);
  return fallback.trim();
}

function geometryGroup(type: GeoJSON.Geometry['type']): string {
  if (type === 'Point' || type === 'MultiPoint') return 'Point';
  if (type === 'LineString' || type === 'MultiLineString') return 'LineString';
  if (type === 'Polygon' || type === 'MultiPolygon') return 'Polygon';
  return 'Geometry';
}
