# Legacy Wildcard Assets Archive

## What was this?
This directory contains experimental raster PNG graphics for MTGA wildcards:
- `lotus_wildcard.png` (30KB root & 16KB subfolder variant): Experimental lotus wildcard raster images.
- `lotus_wildcard_solid.png`: Solid silhouette variant.
- `lotus_wildcard_white.png`: Mask/stencil variant.

In the live application, all wildcard indicators and telemetry widgets (such as `WildcardsGoldenPackWidget.tsx` and `WildcardHistoryModal.tsx`) render using authentic MTG vectors and Keyrune / Mana font glyphs (`ms ms-rarity-rare`, `ms ms-rarity-mythic`, etc.) rather than raster PNGs.

## When was it used?
Added during the initial wildcard widget design explorations (v1.3.0).

## When was it archived?
Archived October 2026 (v1.7.8 cleanup).
