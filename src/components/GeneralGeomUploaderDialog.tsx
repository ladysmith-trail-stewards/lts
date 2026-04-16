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
import {
  getRegionsDb,
  type RegionRecord,
} from '@/lib/db_services/regions/getRegionsDb';
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

type UploadStatus = 'idle' | 'parsing' | 'review' | 'uploading' | 'done';

type GeneralGeomRecord = GeoJSON.Feature;

const baseConfig: UploaderConfig<GeneralGeomRecord> = {
  title: 'Upload General Geometry',
  formats: ['geojson', 'gpx', 'kml'],
  geometryType: 'Any',
  regionBased: true,
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
  const [regions, setRegions] = useState<RegionRecord[]>([]);
  const [regionId, setRegionId] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [epsg, setEpsg] = useState(4326);
  const [collectionLabel, setCollectionLabel] = useState('Imported Geometry');
  const [collectionDescription, setCollectionDescription] = useState('');
  const [collectionVisibility, setCollectionVisibility] = useState<
    'public' | 'private' | 'shared'
  >('public');
  const [mapper, setMapper] = useState<GeneralGeomFeatureImportMapper>(
    DEFAULT_GENERAL_GEOM_MAPPER
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getRegionsDb(supabase).then(({ data }) => {
      if (data) setRegions(data);
    });
  }, []);

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

      const selectedRegion = regions.find((r) => r.id === regionId);
      const effectiveConfig = selectedRegion?.bbox
        ? { ...baseConfig, boundingBox: selectedRegion.bbox }
        : baseConfig;

      const { items, warnings: w } = await parseFiles(
        fileArray,
        effectiveConfig,
        regionId
      );

      if (items.length === 0) {
        setWarnings([...w, 'No valid geometries found in uploaded files.']);
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
      setWarnings(w);
      setStatus('review');
    },
    [mapper, regionId, regions]
  );

  const handleUpload = useCallback(async () => {
    if (regionId === null) {
      toast.error('Please select a region before uploading.');
      return;
    }

    if (!collectionLabel.trim()) {
      toast.error('Collection label is required.');
      return;
    }

    setStatus('uploading');

    const byGeomType = new Map<string, PendingItem<GeneralGeomRecord>[]>();

    for (const item of pending) {
      const kind = geometryGroup(item.record.geometry.type);
      const existing = byGeomType.get(kind) ?? [];
      existing.push(item);
      byGeomType.set(kind, existing);
    }

    let totalSuccess = 0;
    const resultByKey = new Map<
      string,
      { ok: boolean; message: string | null }
    >();

    for (const [geomType, items] of byGeomType.entries()) {
      const features = items.map((item) => ({
        ...item.record,
        properties: {
          ...(item.record.properties ?? {}),
          [mapper.label.field]: item.label,
        },
      }));

      const { results, error } = await importGeneralGeomCollectionDb(supabase, {
        collection: {
          label: collectionLabel,
          description: collectionDescription || null,
          visibility: collectionVisibility,
          region_id: regionId,
          geom_type: geomType,
        },
        mapper,
        features,
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
    collectionLabel,
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
    status === 'review' &&
    pending.length > 0 &&
    regionId !== null &&
    collectionLabel.trim();

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
            {warnings.map((w, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400"
              >
                <HugeiconsIcon
                  icon={AlertCircleIcon}
                  className="size-4 mt-px shrink-0"
                  strokeWidth={2}
                />
                {w}
              </li>
            ))}
          </ul>
        )}

        {(status === 'review' || status === 'uploading' || status === 'done') &&
          pending.length > 0 && (
            <div className="grid md:grid-cols-2 gap-4 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Collection</h3>
                <Input
                  value={collectionLabel}
                  onChange={(e) => setCollectionLabel(e.target.value)}
                  placeholder="Collection label"
                  disabled={status !== 'review'}
                />
                <Input
                  value={collectionDescription}
                  onChange={(e) => setCollectionDescription(e.target.value)}
                  placeholder="Collection description"
                  disabled={status !== 'review'}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={regionId !== null ? String(regionId) : ''}
                    onValueChange={(v) => setRegionId(Number(v ?? 0))}
                    disabled={status !== 'review'}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select region…" />
                    </SelectTrigger>
                    <SelectContent>
                      {regions.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={collectionVisibility}
                    onValueChange={(v) =>
                      setCollectionVisibility(
                        (v ?? 'public') as 'public' | 'private' | 'shared'
                      )
                    }
                    disabled={status !== 'review'}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Visibility" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="shared">Shared</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Input
                  type="number"
                  value={epsg}
                  onChange={(e) => setEpsg(Number(e.target.value) || 4326)}
                  disabled={status !== 'review'}
                  placeholder="EPSG (default 4326)"
                />

                <p className="text-xs text-muted-foreground">
                  EPSG defaults to 4326. If data is latitude/longitude, it is
                  usually EPSG:4326.
                </p>

                <h3 className="text-sm font-medium pt-2">Feature mapper</h3>

                <MapperSection
                  label="Type"
                  fields={mapperFields}
                  fieldValue={mapper.type.field}
                  fallbackValue={mapper.type.fallback}
                  disabled={status !== 'review'}
                  onFieldChange={(value) =>
                    updateMapperField('type', 'field', value)
                  }
                  onFallbackChange={(value) =>
                    updateMapperField('type', 'fallback', value)
                  }
                />

                <MapperSection
                  label="Subtype"
                  fields={mapperFields}
                  fieldValue={mapper.subtype.field}
                  fallbackValue={mapper.subtype.fallback}
                  disabled={status !== 'review'}
                  onFieldChange={(value) =>
                    updateMapperField('subtype', 'field', value)
                  }
                  onFallbackChange={(value) =>
                    updateMapperField('subtype', 'fallback', value)
                  }
                />

                <MapperSection
                  label="Visibility"
                  fields={mapperFields}
                  fieldValue={mapper.visibility.field}
                  fallbackValue={mapper.visibility.fallback}
                  disabled={status !== 'review'}
                  onFieldChange={(value) =>
                    updateMapperField('visibility', 'field', value)
                  }
                  onFallbackChange={(value) =>
                    updateMapperField('visibility', 'fallback', value)
                  }
                />

                <MapperSection
                  label="Label"
                  fields={mapperFields}
                  fieldValue={mapper.label.field}
                  fallbackValue={mapper.label.fallback}
                  disabled={status !== 'review'}
                  onFieldChange={(value) =>
                    updateMapperField('label', 'field', value)
                  }
                  onFallbackChange={(value) =>
                    updateMapperField('label', 'fallback', value)
                  }
                />

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
                  placeholder="Label auto-increment suffix"
                />

                <MapperSection
                  label="Description"
                  fields={mapperFields}
                  fieldValue={mapper.description.field}
                  fallbackValue={mapper.description.fallback}
                  disabled={status !== 'review'}
                  onFieldChange={(value) =>
                    updateMapperField('description', 'field', value)
                  }
                  onFallbackChange={(value) =>
                    updateMapperField('description', 'fallback', value)
                  }
                />

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

              <div className="space-y-2 overflow-y-auto">
                <h3 className="text-sm font-medium">
                  Review features ({pending.length})
                </h3>
                {pending.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm list-none"
                  >
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
                      onChange={(e) => updateLabel(item.key, e.target.value)}
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
                  </li>
                ))}
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

function MapperSection({
  label,
  fields,
  fieldValue,
  fallbackValue,
  onFieldChange,
  onFallbackChange,
  disabled,
}: {
  label: string;
  fields: string[];
  fieldValue: string;
  fallbackValue: string;
  onFieldChange: (value: string) => void;
  onFallbackChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Select
        value={fieldValue}
        onValueChange={(value) => onFieldChange(value ?? '')}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={`${label} field`} />
        </SelectTrigger>
        <SelectContent>
          {fields.length === 0 && (
            <div className="px-2 py-1 text-xs text-muted-foreground">
              No fields found
            </div>
          )}
          {fields.map((field) => (
            <SelectItem key={field} value={field}>
              {field}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={fallbackValue}
        onChange={(e) => onFallbackChange(e.target.value)}
        disabled={disabled}
        placeholder={`${label} fallback`}
      />
    </div>
  );
}

function geometryGroup(type: GeoJSON.Geometry['type']): string {
  if (type === 'Point' || type === 'MultiPoint') return 'Point';
  if (type === 'LineString' || type === 'MultiLineString') return 'LineString';
  if (type === 'Polygon' || type === 'MultiPolygon') return 'Polygon';
  return 'Geometry';
}
