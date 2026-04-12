import { useState } from 'react';
import UploaderCard from '@/components/UploaderCard';
import TrailUploaderDialog from '@/components/TrailUploaderDialog';

export default function DataUploaderPage() {
  const [trailDialogOpen, setTrailDialogOpen] = useState(false);
  const [trailsUploaded, setTrailsUploaded] = useState(0);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12 flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Data Uploader</h1>
        <p className="mt-2 text-muted-foreground">
          Import geospatial data directly into the database. Only admins and
          super-users can upload data.
        </p>
      </div>

      <UploaderCard
        title="Trails"
        description={
          <>
            Upload trail geometry from <strong>.geojson</strong>,{' '}
            <strong>.json</strong>, <strong>.gpx</strong>, or{' '}
            <strong>.kml</strong> files. Each LineString or track segment
            becomes an individual trail record. You can rename trails and pick a
            region before committing.
          </>
        }
        onOpen={() => setTrailDialogOpen(true)}
        statusLine={
          trailsUploaded > 0 ? (
            <>
              Last upload:{' '}
              <span className="font-medium text-foreground">
                {trailsUploaded} trail{trailsUploaded === 1 ? '' : 's'} saved
              </span>
            </>
          ) : null
        }
      />

      <TrailUploaderDialog
        open={trailDialogOpen}
        onOpenChange={setTrailDialogOpen}
        onUploaded={(count) => setTrailsUploaded((n) => n + count)}
      />
    </div>
  );
}
