import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useSearchParams } from 'react-router-dom';
import { useMapbox } from '@/hooks/useMapbox';
import { useTrails } from '@/hooks/useTrails';
import { useGeneralGeom } from '@/hooks/useGeneralGeom';
import { useAuth } from '@/contexts/AuthContext';
import MapControlPanel from '@/components/MapControlPanel';
import TrailDetailDrawer from '@/components/TrailDetailDrawer';
import {
  GeneralGeomPopup,
  type GeneralGeomPopupFeature,
} from '@/components/GeneralGeomPopup';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as
  | string
  | undefined;

if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

export default function MapPage() {
  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex items-center justify-center h-96 text-center px-4">
        <p className="text-muted-foreground">
          Map requires a Mapbox access token. Set{' '}
          <code className="font-mono bg-muted px-1 rounded">
            VITE_MAPBOX_ACCESS_TOKEN
          </code>{' '}
          in your <code className="font-mono bg-muted px-1 rounded">.env</code>{' '}
          file.
        </p>
      </div>
    );
  }

  return <MapPageInner />;
}

function MapPageInner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTrailId = searchParams.get('trailId')
    ? Number(searchParams.get('trailId'))
    : null;

  const { role, regionId } = useAuth();
  const canEdit =
    role !== null && ['admin', 'super_user', 'super_admin'].includes(role);

  // ── Trails data (owned by useTrails, map source kept in sync via push*) ────

  const {
    trails,
    loading,
    error: trailsError,
    saveTrail,
    deleteTrail,
  } = useTrails();
  const {
    features: generalGeom,
    collections: generalCollections,
    visibleCollectionIds,
    visibleCollectionIdSet,
    setCollectionVisible,
    updateCollectionStyle,
    error: generalGeomError,
    loading: generalGeomLoading,
  } = useGeneralGeom();

  // ── General geom popup ───────────────────────────────────────────────────────
  // Refs hold the live Popup and React root so we can close/replace them.
  const geomPopupRef = useRef<mapboxgl.Popup | null>(null);
  const geomPopupRootRef = useRef<ReturnType<typeof createRoot> | null>(null);

  const closeGeomPopup = useCallback(() => {
    geomPopupRef.current?.remove();
    geomPopupRef.current = null;
    geomPopupRootRef.current = null;
  }, []);

  // Stable indirection so we can call the real handler after mapRef is known.
  const onGeomClickImplRef = useRef<
    ((f: GeneralGeomPopupFeature) => void) | undefined
  >(undefined);

  // ── Map ───────────────────────────────────────────────────────────────────────

  const {
    mapContainerRef,
    mapRef,
    currentStyle,
    contourStrength,
    pushTrailUpdate,
    pushTrailDelete,
    handleStyleChange,
    handleContourStrength,
    drawApi,
    setEditingTrailId,
    setElevationHoverPoint,
  } = useMapbox({
    trails,
    generalGeom,
    generalCollections,
    visibleGeneralGeomCollectionIds: visibleCollectionIdSet,
    selectedTrailId,
    searchParams,
    setSearchParams,
    onTrailClick: (id) =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('trailId', String(id));
        return next;
      }),
    // Forward to the impl ref — stable identity, no mapRef needed at hook call time.
    onGeneralGeomClick: (f) => onGeomClickImplRef.current?.(f),
  });

  // Now that mapRef is available, keep the impl ref up to date every render.
  useLayoutEffect(() => {
    onGeomClickImplRef.current = (feature: GeneralGeomPopupFeature) => {
      const map = mapRef.current;
      if (!map) return;

      closeGeomPopup();

      const container = document.createElement('div');
      container.className = 'p-2';
      const root = createRoot(container);
      geomPopupRootRef.current = root;

      const popup = new mapboxgl.Popup({
        closeButton: false,
        maxWidth: '290px',
      })
        .setLngLat([feature.lng, feature.lat])
        .setDOMContent(container)
        .addTo(map);
      popup.addClassName('geom-feature-popup');
      geomPopupRef.current = popup;

      root.render(
        <GeneralGeomPopup feature={feature} onClose={closeGeomPopup} />
      );

      popup.on('close', () => {
        root.unmount();
        geomPopupRef.current = null;
        geomPopupRootRef.current = null;
      });
    };
  });

  // Wrap mutations so the map source is updated alongside useTrails state.
  async function handleSave(feature: Parameters<typeof saveTrail>[0]) {
    const saved = await saveTrail(feature);
    pushTrailUpdate(saved);
    return saved;
  }

  async function handleDelete(id: number) {
    await deleteTrail(id);
    pushTrailDelete(id);
  }

  return (
    <div className="relative overflow-hidden">
      <div
        ref={mapContainerRef}
        className="w-full"
        style={{ height: 'calc(100vh - 120px)' }}
      />

      {loading && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 bg-white/90 rounded-full px-4 py-1.5 text-xs text-slate-600 shadow">
          Loading trails…
        </div>
      )}

      {trailsError && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 bg-red-50 border border-red-200 rounded-full px-4 py-1.5 text-xs text-red-700 shadow">
          Failed to load trails: {trailsError}
        </div>
      )}

      {generalGeomError && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-10 bg-red-50 border border-red-200 rounded-full px-4 py-1.5 text-xs text-red-700 shadow">
          Failed to load other geometry: {generalGeomError}
        </div>
      )}

      <div className="absolute top-4 left-4 z-10">
        <MapControlPanel
          currentStyle={currentStyle}
          contourStrength={contourStrength}
          trailCount={trails.length}
          loading={loading}
          trailsError={trailsError}
          canEdit={canEdit}
          isEditing={drawApi.isEditing}
          generalCollections={generalCollections}
          visibleCollectionIds={visibleCollectionIds}
          onStyleChange={handleStyleChange}
          onContourStrength={handleContourStrength}
          onToggleCollectionVisibility={setCollectionVisible}
          onSaveCollectionStyle={updateCollectionStyle}
          onAddTrail={() =>
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set('trailId', '-1');
              return next;
            })
          }
        />
      </div>

      {generalGeomLoading && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 bg-white/90 rounded-full px-4 py-1.5 text-xs text-slate-600 shadow">
          Loading other geometry…
        </div>
      )}

      <TrailDetailDrawer
        trails={trails}
        onSave={handleSave}
        onDelete={handleDelete}
        drawApi={drawApi}
        regionId={regionId}
        onEditingTrailChange={setEditingTrailId}
        mapRef={mapRef}
        onElevationHoverPoint={setElevationHoverPoint}
      />

      <div className="absolute bottom-2 left-2 z-10 text-xs text-white/70">
        Trail geometry from{' '}
        <a
          href="https://www.trailforks.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Trailforks
        </a>{' '}
        — personal use only.
      </div>
    </div>
  );
}
