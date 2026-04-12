import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  FileUploadIcon,
  Tick02Icon,
  Cancel01Icon,
  AlertCircleIcon,
  InformationCircleIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';
import {
  parseFiles,
  GEO_FILE_FORMAT_EXTENSIONS,
  type UploaderConfig,
  type PendingItem,
} from '@/lib/geoUploader';
import {
  getRegionsDb,
  type RegionRecord,
} from '@/lib/db_services/regions/getRegionsDb';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type UploadStatus = 'idle' | 'parsing' | 'review' | 'uploading' | 'done';

export interface GeoUploaderDialogProps<TRecord> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: UploaderConfig<TRecord>;
  onUploaded?: (count: number) => void;
}

export default function GeoUploaderDialog<TRecord>({
  open,
  onOpenChange,
  config,
  onUploaded,
}: GeoUploaderDialogProps<TRecord>) {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [pending, setPending] = useState<PendingItem<TRecord>[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [regions, setRegions] = useState<RegionRecord[]>([]);
  const [regionId, setRegionId] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (config.regionBased) {
      getRegionsDb(supabase).then(({ data }) => {
        if (data) setRegions(data);
      });
    }
  }, [config.regionBased]);

  const prevOpenRef = useRef(open);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (wasOpen && !open) {
      const id = setTimeout(() => {
        setStatus('idle');
        setPending([]);
        setWarnings([]);
      }, 200);
      return () => clearTimeout(id);
    }
  }, [open]);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      setStatus('parsing');
      setWarnings([]);

      const selectedRegion = regions.find((r) => r.id === regionId);
      const effectiveConfig = selectedRegion?.bbox
        ? { ...config, boundingBox: selectedRegion.bbox }
        : config;

      const { items, warnings: w } = await parseFiles(
        fileArray,
        effectiveConfig,
        regionId
      );

      if (items.length === 0) {
        setWarnings([
          ...w,
          `No valid ${config.noun} geometries found in the uploaded files.`,
        ]);
        setStatus('idle');
        return;
      }

      setPending(items);
      setWarnings(w);
      setStatus('review');
    },
    [config, regionId, regions]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) processFiles(e.target.files);
      e.target.value = '';
    },
    [processFiles]
  );

  const updateLabel = useCallback((key: string, label: string) => {
    setPending((prev) =>
      prev.map((item) => (item.key === key ? { ...item, label } : item))
    );
  }, []);

  const removeItem = useCallback((key: string) => {
    setPending((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const handleUpload = useCallback(async () => {
    if (config.regionBased && regionId === null) {
      toast.error('Please select a region before uploading.');
      return;
    }

    // Re-map records with the final regionId (in case it was set after parsing).
    const records = pending.map((item) => item.record);

    setStatus('uploading');

    let results;
    try {
      results = await config.submit(records);
    } catch (err) {
      toast.error(
        `Upload failed: ${err instanceof Error ? err.message : String(err)}`
      );
      setStatus('review');
      return;
    }

    setPending((prev) =>
      prev.map((item, i) => ({
        ...item,
        result: results[i] ?? { ok: false, message: 'No result returned' },
      }))
    );

    setStatus('done');

    const successCount = results.filter((r) => r.ok).length;
    const noun = config.noun;
    const nounPlural = `${noun}s`;

    if (successCount === results.length) {
      toast.success(
        `${successCount} ${successCount === 1 ? noun : nounPlural} uploaded successfully.`
      );
    } else {
      toast.warning(
        `${successCount} of ${results.length} ${nounPlural} uploaded. Check results for errors.`
      );
    }

    if (successCount > 0) onUploaded?.(successCount);
  }, [config, pending, regionId, onUploaded]);

  const reset = useCallback(() => {
    setStatus('idle');
    setPending([]);
    setWarnings([]);
  }, []);

  const acceptAttr = config.formats
    .flatMap((f) => GEO_FILE_FORMAT_EXTENSIONS[f])
    .join(',');

  const supportedLabel = config.formats
    .flatMap((f) => GEO_FILE_FORMAT_EXTENSIONS[f])
    .join(', ');

  const canUpload =
    status === 'review' &&
    pending.length > 0 &&
    (!config.regionBased || regionId !== null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>
            Drop one or more {supportedLabel} files to import into the database.
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
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
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
              onChange={handleFileInput}
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
            <div className="flex flex-col gap-3 overflow-y-auto flex-1 min-h-0">
              {config.regionBased && status !== 'done' && (
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium shrink-0">Region</label>
                  <Select
                    value={regionId !== null ? String(regionId) : ''}
                    onValueChange={(v) => setRegionId(Number(v))}
                  >
                    <SelectTrigger className="w-48">
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
                  <span className="text-xs text-muted-foreground">
                    Applied to all items in this upload.
                  </span>
                </div>
              )}

              <ul className="flex flex-col gap-2">
                {pending.map((item) => (
                  <UploadItemRow
                    key={item.key}
                    item={item}
                    onLabelChange={(label) => updateLabel(item.key, label)}
                    onRemove={() => removeItem(item.key)}
                    disabled={status !== 'review'}
                  />
                ))}
              </ul>
            </div>
          )}

        <DialogFooter showCloseButton={status !== 'uploading'}>
          {status === 'review' && (
            <>
              <Button variant="outline" size="sm" onClick={reset}>
                Reset
              </Button>
              <Button size="sm" onClick={handleUpload} disabled={!canUpload}>
                Upload {pending.length}{' '}
                {pending.length === 1 ? config.noun : `${config.noun}s`}
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

interface UploadItemRowProps<TRecord> {
  item: PendingItem<TRecord>;
  onLabelChange: (label: string) => void;
  onRemove: () => void;
  disabled: boolean;
}

function UploadItemRow<TRecord>({
  item,
  onLabelChange,
  onRemove,
  disabled,
}: UploadItemRowProps<TRecord>) {
  const { label, coordCount, result } = item;

  return (
    <li className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm">
      {result ? (
        result.ok ? (
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
      ) : (
        <HugeiconsIcon
          icon={InformationCircleIcon}
          className="size-4 shrink-0 text-muted-foreground"
          strokeWidth={2}
        />
      )}

      <Input
        value={label}
        onChange={(e) => onLabelChange(e.target.value)}
        disabled={disabled}
        className="flex-1 h-8 text-sm"
        placeholder="Label"
      />

      <Badge variant="secondary" className="shrink-0 tabular-nums">
        {coordCount} pts
      </Badge>

      {result && !result.ok && result.message && (
        <span className="text-xs text-destructive truncate max-w-[200px]">
          {result.message}
        </span>
      )}

      {!disabled && (
        <button
          type="button"
          aria-label="Remove item"
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          onClick={onRemove}
        >
          <HugeiconsIcon
            icon={Cancel01Icon}
            className="size-4"
            strokeWidth={2}
          />
        </button>
      )}
    </li>
  );
}
