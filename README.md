# Sisu: Guardian of the Garden (Phase 1 Prototype)

Retro platformer prototype built with Vite + TypeScript + HTML5 Canvas 2D.

## Run

```bash
npm install
npm run dev
```

Build static output:

```bash
npm run build
```

Build artifacts are generated in `dist/`.

## Controls

- Desktop:
  - `ArrowLeft` / `ArrowRight`: move
  - `Space`: jump
  - `ArrowDown`: dig (stub, not implemented)
- Mobile:
  - On-screen `Left`, `Right`, `Jump`, `Dig` buttons

## Phase 1 Features

- Internal canvas resolution `320x180`
- Pixel-perfect integer scaling with smoothing disabled
- Start screen and title UI
- Sound toggle button (stub)
- Basic platformer physics (gravity, jump impulse, friction, max speed)
- AABB collision against rectangle platforms
- Sprite animation states (idle, run, jump) with horizontal flip
- 3-heart HUD placeholder

## Sprite Assets

- Runtime atlas: `public/assets/sisu-atlas.png`
- Atlas metadata: `public/assets/sisu-atlas.json`
- Source reference sheet: `public/assets/sisu-raw-sheet.png`

Regenerate the atlas from the source sheet with:

```bash
node scripts/extract-sisu-atlas.mjs
```

## Phase 2 Roadmap

- Tilemap-driven level data + camera boundaries
- Dig action gameplay loop and collectible seeds
- Enemy patrols and damage/invulnerability states
- Proper sprite atlas metadata and richer animations
- Audio integration (music, SFX, mute persistence)
- Win/lose states and level restart flow
