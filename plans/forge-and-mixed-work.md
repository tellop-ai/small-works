# Small Works: forge and mixed work

Status: complete, 2026-10-28. Continue the next implementation milestone from the approved [product specification](product-spec.md). The previous crew/joinery milestone is verified: 75 tests, independent review, contained build, real browser flows and source export. All app source stays in this independent repository; both distributions remain entirely free and offline.

## Acceptance

- [x] **Build and staff the forge.** Requires joinery bench, 480 lifetime focus minutes and one advanced wooden recipe completed. Reserve 360 coins, consume 60 minutes of construction, then reveal the forge and blacksmith invitation. Welcome the blacksmith for 160 coins and 20 minutes of onboarding; activation only on completion. Preserve one active improvement/onboarding, refunds once, role gating, descriptive experience and off-duty staff. No new schema or dependencies.
- [x] **Make and sell metalwork.** Hinge set (18 coins; 20/10/15 minutes), tool head (24; 30/10/20), lantern (30; 45/15/30), iron stand (42; 60/20/40). Require completed forge and active blacksmith. Maker cannot do metalwork; blacksmith cannot do construction or carpentry. Pin recipes and prices; keep the same material reservation, details, salvage, showroom and sale rules.
- [x] **Cooperate on mixed projects.** Chest (60 coins, body60 → fittings20 → assembly20; details30/50), garden bench (96, wood70 and iron60 independent → assembly30; details40/60), standing lamp (51, wood25 and metal45 independent → assembly20; details30/40). Show component targets and skills. Lanes may target distinct independent stages of one job; never the same stage. Merge changes to a job once. Assembly/dependent work only starts against persisted prerequisites, in a subsequent session or explicit bank allocation. Extra/role-blocked effort goes to the bank. Preserve integer conservation, fixed lane identities, paused share changes, held jobs, bounded records requests and legacy saves. Still at most two lanes, with the apprentice required to open the second; the craft yard is later.
- [x] **Show a working forge.** Add a physical forge bay, warm restrained hearth, anvil and a distinct blacksmith character with work animations. Preserve Nora and Ada, their separate stations and approved joint limits. Show all active staff, including off duty; animate allocated workers only. Render distinct metal and mixed objects and meaningful component progress. Keep local assets, static/reduced/hidden support and disposal.
- [x] **Verify the combined milestone.** Real SQLite and bounded-adapter tests, no-cheat solvent route, same-job merging, wrong-skill/prerequisite rejection, trimming/retry/concurrency, old saves, matching EN/TR UI, independent review, contained build, desktop/narrow browser walkthrough and export checks. No public release claimed.

## Source map and ownership

Content/spec and pure rules: `lib/game/`. Atomic game operations: `lib/data/workshop.js`, via `lib/data/index.js` and kit `modelBatch`. Main UI: `app/small-works.jsx`, `components/small-works/crew-ui.jsx`; request validation: `app/api/workshop/route.js`; EN/TR: `lib/i18n/locales/`. Visual scene: `lib/scene/workshop.js`, React wrapper: `components/small-works/workshop-scene.jsx`; provenance: `lib/content/asset-provenance.json`.

Core stage accounting is an independently testable prerequisite for UI integration; its command/snapshot contract must be settled before UI implementation. The procedural visual scene can proceed independently behind the same agreed props. Combined review covers the complete behavior after these components join.

Baseline source is preserved outside the repository, with hashes in `forge-baseline.json`. Report: [forge-and-mixed-work-report.md](forge-and-mixed-work-report.md). No agent edits this ledger.

## Remaining first-release scope

Craft yard, carver/finisher, greenhouse, patterns/customization, expanded commissions, full history/CSV/print, durable preferences, accessibility/artwork and release parity checks. The existing style scanner flags literal 3D material colors; resolve that classification before store release without weakening platform gates. No commits, remotes, publication or deployment are part of this milestone.
