---
id: F-001
type: feature
epic: trail-management
status: draft
created: 2026-03-24
updated: 2026-03-24
---

# Draw Trail

> Epic: [Trail Management](../spec.md) — E-001

## Flags

| Flag | |
|------|-|
| DB Change | ✅ |
| Style Only | ⬜ |
| Env Update Required | ⬜ |

## Problem

Admins and builders currently have no way to create new trail geometries directly in the browser. Adding a trail requires manually inserting via PostGIS.

## Solution

Add a draw mode to the map page using Mapbox Draw (`@mapbox/mapbox-gl-draw`) and / or `mapbox-gl-draw-snap-mode` . When a builder or admin activates draw mode, they can:

1. Click to place waypoints along a trail route on the live Mapbox basemap.
2. Edit or delete waypoints before saving.
3. Confirm the geometry and provide trail metadata (name, difficulty, surface, description) in a side panel form.
4. Save — the trail LineString geometry and metadata are written to the `trails` table via the existing `bulk_trail_mutations` RPC or a new `insert_trail` RPC.

### Starting New Trail
Button to add new trail, opens draw mode + drawer

### Deleting Trail
Button in modal, with confirmation prompt.

### Cancelling Edit
Button in modal, with confirmation prompt. Should undo all changes made during the edit session.

### Editing
- Click on Line, drag to adjust waypoints. Delete Button should remove waypoints.
- Enter or Right click should end drawing.
- Shift Click should Add new Vertices to End of Line
- Shift-Alt Click should Add new Vertices to Start of Line
- Space should toggle snap mode
- Shift delete should remove the last vertex.
- Delete should remove the selected vertex.
- Ctrl-Z should undo the last action. 
- Ctrl-Y should redo the last undone action.

![Draw Trail](./drawTrail.png)

### Permissions
Draw mode is available to **builders and admins only**. Members and public visitors see a read-only map.

## Out of Scope

- Elevation data capture during draw — handled by F-002.

## In Scope

- **Snap to line / point** — while drawing, snap the cursor to existing trail endpoints and lines to ensure clean network connectivity.

## Testing

**Unit tests:**
- `trailEditSchema` Valibot schema validates required fields (name, difficulty), rejects missing geometry.

**Integration tests:**
- Authenticated admin or builder can POST a new trail via the RPC and it appears in `trails_view`.
- Member or unauthenticated user receives an RLS denial when attempting the same insert.
- Trail with duplicate name is rejected (unique constraint).
- Backend warns on invalid geometry (e.g. fewer than 2 coordinates) — save is allowed but a warning is surfaced to the user.

**Edge cases:**
- Network error mid-save — form shows error state and does not clear entered data.
- Very long trail (500+ waypoints) — Mapbox Draw layer renders without lag.
- User navigates away mid-draw — prompt to confirm discard.
- Snap target is ambiguous (multiple nearby endpoints) — snap to the nearest.
- 3D editing support — pinning to terrain.

## Notes

- Builds on existing `TrailDetailDrawer` component and `trailEditSchema.ts`.
- Reuse shadcn form primitives (`input.tsx`, `select.tsx`, `textarea.tsx`) for the metadata form.
- Use `madrone-bark` button variant for the primary save action (project convention).
- Geometry warnings (short trail, potential self-intersection) are surfaced in the UI but do not block save — backend stores as-is.
- Draw accuracy depends on basemap zoom; no GPS snap in v1. Document this limitation in the UI.
- Undo/redo within a draw session is out of scope for v1 — user can delete waypoints and redraw.
- See issue #30 ("Task: Add Trail (Draw)") for prior discussion.

## Related Issues

| Issue | Description | Status |
|-------|-------------|--------|

## Related PRs

| PR | Description | Status |
|----|-------------|--------|

## Changelog

| Date | Description | Initiated by | Why |
|------|-------------|--------------|-----|
| 2026-03-24 | Spec created | KS | New spec system |

| PR | Description | Status |
|----|-------------|--------|
