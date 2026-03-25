---
id: E-001
type: epic
epic: null
status: active
created: 2026-03-24
updated: 2026-03-24
---

# Trail Management

## Problem

Primarily for Trail Stewards! We often use multiple apps like Gaia and Trailforks to locate areas for maintanance or for new trails. In addition we have to manage other spatial data ourselves, like elevation, land owner, and land cover. A trail management system integrated into the app would centralize all trail data, eliminate the need for external GIS tools, and allow stewards to maintain their trails end-to-end from the browser. This is a helpuful feature for steward adoption and long-term data integrity. Additionally Sharing read access between users / user groups outside of a payed app like trailforks would be valuable. 

## Solution

A Trailforks-inspired trail management experience — clean, map-first, fast — but purpose-built for building and maintenance rather than just consumption. The system serves two distinct audiences:

- **Public / Members** — browse and explore trails: view metadata, elevation profiles, difficulty, and surface type.
- **Power Users (Builders) & Admins** — full write access: draw new trails, edit geometry and metadata, plan proposed networks, and coordinate maintenance.

Builders can share draft trail networks with other builders before any trail breaks ground — enabling collaborative planning as a first-class workflow.

## Goals

- Look and feel loosely like Trailforks: map-first, trail cards with key stats, clean detail panel.
- Builders and admins can create, edit, and delete trails entirely in the browser.
- Builders can plan and share proposed trail networks with other builders before they are built.
- Any visitor can view trail details: name, difficulty, surface, distance, and elevation profile.
- All trail writes are gated by role — builders and admins only.

## User Roles

| Role    | Read | Write | Share drafts |
|---------|------|-------|--------------|
| Public  | ✓    |       |              |
| Member  | ✓    |       |              |
| Builder | ✓    | ✓     | ✓ (with other builders) |
| Admin   | ✓    | ✓     | ✓            |

## Features

| ID    | Type    | Name                                              | Status | Spec |
|-------|---------|---------------------------------------------------|--------|------|
| F-001 | feature | Draw Trail                                        | draft  | [spec](./draw-trail/spec.md) |
| F-002 | feature | Trail Elevation Profile                           | draft  | [spec](./trail-elevation-profile/spec.md) |

## Work Plans (Future)

Items explicitly deferred to later epics — not out of scope forever:

- **GPX / KML import** — bulk import trail geometry from GPS devices and existing GIS exports.
- **Attachments** — photos, PDFs, and maintenance reports attached to trail records.
- **Work plans** — Geospatial work plans for trail maintenance and development.
- **Points of Interest** — notable locations along the trail, such as viewpoints, rest areas, and historical sites.
- **User-generated content** — allow users to submit photos, reviews, and trail conditions.
- **Additional Layers** — support for overlaying additional data layers on the map, such as soil types, vegetation, and land use.
- **Offline support** — cached map tiles and trail data for field use without connectivity.

