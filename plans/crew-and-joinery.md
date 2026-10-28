# Small Works: crew and advanced joinery

Status: complete, 2026-10-28. The approved first playable app continues in this independent repository. This milestone adds an apprentice, shared focus and advanced wooden work. Full-release requirements remain in [product-spec.md](product-spec.md).

## Grounding and compatibility

The previous build has six carpentry recipes, one work lane, a first commission, a carpenter's room, saved sessions/effort and atomic operation receipts. `lib/game/content.js` owns bundled content; `lib/game/rules.js` interprets pinned job snapshots; `lib/data/workshop.js` owns every game mutation through the kit's `modelBatch`. `app/small-works.jsx` is the UI; `app/api/workshop` is its validated local API. The complete future record shape already includes CrewMember, SessionPart and FocusAllocation. No schema change is needed for this milestone.

Preserve old jobs, running sessions, snapshots, prices and receipts. Keep the first-sale balance and all-free/offline contract. Keep the approved Nora model and cap intact. The baseline is retained outside the repository and recorded in `crew-baseline.json` so all existing uncommitted work survives.

## Acceptance

- [x] **Welcome and train the apprentice.** Requires the completed carpenter's room and 120 lifetime focus minutes. Charge 90 coins once, then 15 focus minutes of onboarding. Activation only on completed onboarding, at most one active onboarding. Cancellation refunds once, retains spent time and permits later re-recruitment. Show skills, requirements, progress and allocated experience in English and Turkish. One apprentice, no recurring wages.
- [x] **Share real effort across two workers.** One maker lane before recruitment, up to two after onboarding. One eligible worker and distinct target per lane; apprentice basic carpentry only, maker construction/onboarding/joinery. Shares are 10-point increments totalling100. Fixed identities during a session; pause to change shares. Integer cumulative rounding, trimmed retained spans, bank overflow, bank applications, staff experience, session-held jobs, duplicate receipt recovery and atomic race handling must conserve effort. Two workers never double focus. Existing single-lane sessions remain readable and settle correctly.
- [x] **Build the joinery bench and advanced goods.** Completed carpenter's room, 240 focus minutes and five distinct starter recipes. Charge180 coins, then30 focus minutes to construct. Payment alone unlocks nothing. Add dining chair (36 coins;60/20/40 minutes), writing desk (60;90/30/60), cabinet (84;120/40/80), same pinned workmanship rate and sale/detail rules. Locked requirements remain visible. Funding/cancellation cannot deadlock saleable-job slots.
- [x] **Show the growing workshop.** Apprentice appears only after recruitment, has a separate usable workbench and animates only allocated work. Joinery bench changes the room. Distinct finished chair/desk/cabinet shapes make new projects recognizable. Respect hidden-page suspension, still/reduced mode and cleanup; preserve Nora's model and wrist restrictions.
- [x] **Verify the combined app.** Meaningful real SQLite/bounded-adapter tests, old-save compatibility, concurrent welcome/settlement/refund tests, independent review, local export check and actual contained build/browser walkthrough. Check narrow layout and both languages. Record proof limits honestly.

## Existing evidence and next milestones

Previous build:60 app tests passed, source export screening passed, contained build/runtime and browser first-sale/recovery tested. Literal 3D material colors remain outside the platform UI style checker's current assumptions; no platform check is weakened here.

After this milestone: forge/blacksmith/metal and mixed crafts; yard/full crew/greenhouse; full history/CSV/print and durable preferences; comprehensive artwork, accessibility and clean-install/public parity release checks. This milestone does not claim those complete or publish a repository/listing.

Execution evidence: [crew-and-joinery-report.md](crew-and-joinery-report.md).
