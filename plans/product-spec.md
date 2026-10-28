# Small Works product specification

> Status: detailed product specification, 2026-10-27; implementation started 2026-10-28 after the founder approved the animated 3D workshop and asked to start the app. The first internal carpentry build is tracked in `plans/small-works-first-build.md`. Store submission and public publication have not started.
> Store id: `small-works`. Product name: **Small Works** in both languages. Turkish descriptive name: **Küçük İşler Atölyesi**.
> The founder's fixed requirement: all gameplay and content are free for Tellop store users and users of the public GitHub version. No separate paid edition.

## 1. Product and decisions

Small Works turns personal focus sessions into handmade objects and a growing craft workshop. The person starts as a carpenter. Their focused time constructs objects, improves their finish, and creates value. They sell finished goods for fictional coins, build better facilities, welcome craftspeople, and eventually combine woodwork and metalwork on larger projects.

The person does their real activity outside the game. The workshop is a calm visual companion to that activity. It is not a clicker, a concentration detector, an employee tracker, or a business accounting app. All customers, staff, sales, materials, and coins are fictional.

### Confirmed direction

- Begin with carpentry. Make objects, sell them, and use earnings to expand.
- Value reflects the focus invested in an object. More detailed and larger objects can hold more work.
- Staff work in the workshop. Expansion includes blacksmithing and combined crafts.
- Create original artwork, writing, sounds, characters, mechanics, and product identity.
- All features, crafts, staff, recipes, customization, and future official content additions remain free in both distributions.

### Design defaults established by this specification

These defaults make the requested concept concrete. Numerical values are initial balancing parameters, not playtest results. They may change before release while preserving the fixed requirements.

- One minute of confirmed focus produces one minute of workshop effort, shared across all workers.
- Coins are earned by selling completed objects. Focus itself does not also pay coins.
- Staff add capabilities, project allocation, and visual life. They do not multiply focus or earn unattended income.
- No rent, recurring wages, hunger, injuries, durability loss, debt, expiring commissions, attendance penalties, or lost streaks.
- No AI dependency, account created by this app, external service, advertising, donation prompt, purchase, or paid accelerator in gameplay.
- The complete first public release includes carpentry, a functioning forge, staff, mixed-craft goods, and one community project. The smaller carpentry prototype is an internal validation slice, not the complete promised product.

## 2. Free access and the public edition

The Tellop package and public GitHub export have the same game rules, content, languages, asset quality, and progression. Progression locks require play only. Never check a Tellop subscription, entitlement, network response, API key, or repository origin to unlock a craft or item.

The public version must install and run locally without a Tellop account or a paid service. Initial installation requires the documented runtime and package downloads. After installation, all core gameplay works without internet. Tellop's own installation and account rules remain platform rules; do not claim this spec changes Tellop's pricing or authentication.

Ship all runtime artwork and audio with the export. No CDN assets, remote fonts, streamed music, hosted economy, mandatory analytics, license-check server, or required AI generation. Development tools used to make assets are not runtime dependencies. No keys are required and no AI controls appear in this release.

Use the existing store export and its Apache-2.0 output with the standard Pathnomic Labs attribution. Record original asset provenance and applicable redistribution terms in an export-compatible location, such as `lib/content/asset-provenance.json`. Every asset must be cleared for the intended public distribution; a public source-code repository alone does not establish that. Do not change the exporter or claim licensing/publication approval through this spec. Verify the final export, notices, and asset permissions before publishing.

Do not promise a free hosted service, multiplayer server, or automatic cloud synchronization. The public edition is a complete local application. Its generated bilingual README must accurately explain installation, local storage, backup, and updating while preserving data. Validate the generated result rather than hand-maintaining a second package definition.

## 3. Experience and loops

### First use

1. Show a small, tidy carpenter's space with the maker, an empty bench, and a few tools.
2. Explain: “Focus on your work. Build something here.” Offer optional workshop and maker names.
3. The explicit **Open my workshop** action creates the game with 40 coins, the starter bench, and the six starter recipes. Opening a page creates nothing.
4. Offer a first stool commission, or a five-minute wooden spoon for a shorter start. The stool order asks for the base finish and never expires.
5. The person chooses a project and optionally types their real intention. Start a session with a preset or count-up timer.
6. Show a quiet work scene. At the end, confirm time, reveal progress, and offer a break.
7. A finished object can be sold, kept, or given more detail. Explain the material cost and earned workmanship separately.
8. Reveal the next workshop improvement with all its requirements. Never offer an unexplained locked silhouette as the only guidance.

### Repeating loops

| Timescale | Loop | Reward |
| --- | --- | --- |
| Session | Choose work → focus → confirm elapsed time → reveal progress | A visible construction stage or completed object |
| Object | Build → choose additional detail → finish → sell or keep | Coins, a keepsake, or a commission delivery |
| Workshop | Earn → fund an improvement → focus on construction → activate it | New space, recipes, work lanes, and staff opportunities |
| Crew | Welcome a craftsperson → complete onboarding → assign suitable work | New techniques and a livelier workshop |
| Community | Choose a shared build → make its stages → deliver | A permanent scene in the local game world |
| Personal history | Attach an optional intention → focus → review accumulated effort and objects | A record of what the person spent time on |

Management should usually take less than a minute between sessions. No sales popups, staffing decisions, order expiry, or upgrade notifications interrupt a running session. Session completion collects all changes into one reveal.

## 4. Focus sessions and recovery

### Timer behavior

- Countdown presets: 5, 15, 25, and 50 minutes. Custom duration: 1–180 whole minutes.
- Count-up mode has no chosen target but ends its current segment at 180 minutes. The person may explicitly start another segment. There is no daily earnings cap or reward for selecting a longer segment.
- Break presets: 5, 10, and 15 minutes; custom 1–60 minutes. A break produces no workshop effort and never starts another session automatically.
- Pause, resume, and finish early are available. Paused time earns nothing. There is no abandonment animation or guilt language.
- A break can start without a preceding focus session. The person can leave the screen during a break.
- Switching to another app or hiding the workshop does not count as failure. The purpose is to work elsewhere.
- At completion or early finish, show the measured candidate duration. **Keep this time** confirms it. The person can reduce the duration or choose **Do not count this time**. A confirmed zero duration closes the session without an award.
- The workshop does not verify attention, monitor other apps, capture the screen, or record input. Describe confirmed time as “focus time,” not verified concentration.

### Durable lifecycle

Persist start, pause, resume, and confirmation only in response to the person's actions. Derive a running display from saved timestamps and the current clock. Never write every second, on page load, or on a background heartbeat. Countdown expiry can show a completion view without writing a reward. Confirmation makes the durable award.

The lifecycle is `running → paused → running`, followed by `settled` or `discarded`. A running session that reached its limit is derived as **Ready to finish**; this does not require an automatic state write. Only one unsettled session exists for an owner. The workshop record carries its id.

Persist accumulated paused-safe seconds and the start of the current active span. A finish request calculates candidate active seconds and clamps them to the segment limit. Use integer seconds, never floating-point minutes. Keep session parts at pause and finish boundaries for history by day. Date/time instants are UTC strings; history groups them using the saved IANA time zone and divides midnight-crossing spans correctly.

When a page is reopened, a process restarts, the device sleeps, or a clock discontinuity is suspected, show a recovery review. Offer the bounded candidate time and let the person confirm a smaller duration or discard it. Do not silently award time spent asleep or away, auto-resume, or claim reliable sleep detection. A backward clock gives no negative time; show a recovery choice. A forward jump cannot exceed the session limit. The user can always begin a fresh segment after resolving the old one.

If saving fails, preserve the displayed result and show **Check saved progress**. Read the operation receipt before permitting a resubmission. Never start a second session or mint a second reward while the first result is uncertain. If a tab closes before confirmation, the saved session is available for recovery. Unsubmitted notes can be lost; do not promise otherwise.

Local elapsed-time animation and audio run only while the relevant page is present. Rendering may stop when hidden; focus accounting is derived from the saved session and bounded recovery. There is no server daemon, service worker, closed-app reminder, native app blocker, native widget, or menu-bar timer in the first release.

## 5. Effort accounting and allocation

### One conserved resource

One accepted focus second creates one effort second. The same second cannot count toward two projects, a project and training, or a material and its parent assembly twice.

For each confirmed session:

`accepted seconds = seconds applied to work + newly banked seconds + seconds explicitly counted as practice`

For the whole workshop:

`lifetime accepted seconds = current bank + all seconds ever applied + all practice seconds`

Applied time remains counted when an object is sold, kept, donated, or salvaged. Salvaging does not return its time to the bank. No action may increase lifetime focus except settling a new session. Time spent on later-cancelled work stays in the applied category of this equation. Calling it practice in a history description must not also increment the separate unallocated-practice counter.

### Work lanes

At the starter bench, all effort goes to one selected job. After the apprentice joins, up to two lanes may receive effort. The craft yard permits three. Each lane has one eligible worker and a distinct work target; a worker cannot occupy two lanes. Independent component stages within one mixed job may be distinct targets, as defined below.

The default is one lane. The person may choose equal shares or percentages in 10-point increments totaling 100. The assignment is fixed during a running span; pause first to change it. Apply shares in seconds using a cumulative remainder calculation, so settlement in several pauses gives the same totals as one uninterrupted span. Ties use the saved lane order.

Example: a 30-minute session at 60/40 gives 18 minutes to a stool and 12 minutes to a chest. Hiring extra staff does not make this 60 or 90 minutes of work.

A lane stops allocating when it reaches the chosen finish level or a blocked component. Unused effort enters the bank. Do not redirect it to an unapproved job or spend coins automatically. The bank is unlimited within safe storage bounds; applying it is a separate press and creates no new focus or worker experience.

### No suitable project

**Focus without a project** remains available. Time goes to the bank. A banked session may later be applied to an eligible job, workshop construction, or staff onboarding. **Count as practice** permanently records time without creating game value. Show that distinction before confirmation.

The bank prevents a nearly finished object, a material shortage, or an unavailable specialist from wasting the person's session. Staff animations reflect actual allocations; unassigned workers may perform purely decorative chores.

## 6. Crafting model

Each recipe defines material cost, required facilities, stages, required worker skills, two optional detail levels where appropriate, and its visible result. Recipes and their versions are bundled code content. They are not mutable database catalog rows.

Starting a job reserves its chosen material cost immediately. A job moves through `making`, `ready`, and exactly one final disposition: `sold`, `kept`, `donated`, or `salvaged`. A ready object can return to `making` when an optional detail level is explicitly chosen. It remains unsellable at that unfinished level until that level is finished or explicitly abandoned back to the previous finish. Abandoned detail work remains in history but earns no sale value and cannot return to the bank.

All base stages must finish before sale. Completed stages have a fixed order and effort requirement. Detail level 1 requires the base; detail level 2 requires level 1. Select the desired finish before focusing. No automatic move into an extra detail level.

The base material reservation includes both detail levels for the initial catalog, so adding detail does not create surprise material charges. Future recipes with different material choices must show and reserve the total before starting. The released version of a recipe is pinned to each job; catalog updates cannot alter its cost, required work, or promised value midway.

### First-release saleable catalog

All figures below are initial tuning values. `Base`, `D1`, and `D2` are additional focus minutes, not cumulative totals. Coins have no real-world value.

| Recipe id | Object | Facility | Materials | Base | D1 | D2 |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| wooden-spoon | Wooden spoon | Starter bench | 0 | 5 | 5 | 10 |
| stool | Stool | Starter bench | 12 | 20 | 15 | 20 |
| birdhouse | Birdhouse | Starter bench | 18 | 30 | 10 | 20 |
| wall-shelf | Wall shelf | Starter bench | 24 | 40 | 15 | 25 |
| keepsake-box | Keepsake box | Starter bench | 20 | 35 | 15 | 30 |
| toy-boat | Toy boat | Starter bench | 15 | 25 | 10 | 20 |
| dining-chair | Dining chair | Joinery bench | 36 | 60 | 20 | 40 |
| writing-desk | Writing desk | Joinery bench | 60 | 90 | 30 | 60 |
| cabinet | Cabinet | Joinery bench | 84 | 120 | 40 | 80 |
| hinge-set | Decorative hinge set | Forge and blacksmith | 18 | 20 | 10 | 15 |
| tool-head | Hand-tool head | Forge and blacksmith | 24 | 30 | 10 | 20 |
| lantern | Metal lantern | Forge and blacksmith | 30 | 45 | 15 | 30 |
| iron-stand | Iron stand | Forge and blacksmith | 42 | 60 | 20 | 40 |
| reinforced-chest | Reinforced chest | Joinery bench and forge | 60 | 100 | 30 | 50 |
| garden-bench | Garden bench | Joinery bench and forge | 96 | 160 | 40 | 60 |
| standing-lamp | Standing lamp | Joinery bench and forge | 51 | 90 | 30 | 40 |

The wooden spoon uses bundled offcuts, costs no coins, remains repeatable, and is always available. This is the permanent recovery path from zero coins. It requires real effort and pays at the normal rate.

Visual detailing varies by object: sanding and oiling; carved borders; fitted joints; engraved metal; patterned shades. Detail labels describe the actual change. Never label a short session's object “poor” or “failed.” Base work is useful and well made.

### Combined crafts

For mixed objects, component stages live within the same job. They are not separately tradable inventory in the first release. Components can be built in eligible lanes; assembly waits until its prerequisites finish. This avoids buying and consuming the same component repeatedly while retaining visible cooperation.

| Mixed object | Base stages | Raw material allocation |
| --- | --- | --- |
| Reinforced chest | Wooden body 60 min → fittings 20 min → assembly 20 min | 36 + 18 + 6 = 60 coins |
| Garden bench | Wooden seat 70 min; iron frame 60 min; assembly 30 min after both | 42 + 42 + 12 = 96 coins |
| Standing lamp | Wooden base 25 min; lantern 45 min; assembly 20 min after both | 15 + 30 + 6 = 51 coins |

Independent component stages may progress in separate lanes only when the job explicitly supports it. Treat a lane target as `(jobId, stageId)`; distinct targets within one job are allowed, and all targets share the conserved session pool. Assembly adds only its own time. A finished hinge set in the showroom cannot also be consumed as a component. Separate transferable component inventory is outside this release.

## 7. Economy and selling

### Units and formula

Store coins as integer hundredths, with checked arithmetic. One focus second of completed saleable work adds five hundredths of a coin, which is **3 coins per minute**. There is no trade-rate multiplier, streak multiplier, random price, staff productivity multiplier, or reward for a long uninterrupted session.

For a finished object:

`workmanshipMinor = completedSaleableEffortSeconds × 5`

`marketPriceMinor = reservedMaterialMinor + workmanshipMinor`

`commissionBonusMinor = floor(eligibleWorkmanshipMinor / 10)`

`commissionPriceMinor = marketPriceMinor + commissionBonusMinor`

The bonus is 10% of work required by the commission's requested finish. Extra optional detail retains its normal workmanship value but receives no additional commission bonus. Materials never receive a bonus. All figures are shown before starting or selecting more detail. Use a localized fictional-coin number format, not TRY, USD, or a currency symbol.

### Worked examples

| Object | Material deposit | Completed focus | Market sale | Profit after materials |
| --- | ---: | ---: | ---: | ---: |
| Base stool | 12 | 20 min | 72 | 60 |
| Stool with D1 | 12 | 35 min | 117 | 105 |
| Stool with D2 | 12 | 55 min | 177 | 165 |
| Base reinforced chest | 60 | 100 min | 360 | 300 |
| Base garden bench | 96 | 160 min | 576 | 480 |

A base-stool commission pays 78 coins: 12 materials + 60 workmanship + 6 commission bonus. Starting with 40 coins gives 28 after reserving materials and 106 after delivery. A D2 stool delivered to that base commission pays 183, not 193.50: the bonus remains 6.

Larger objects hold more effort and create larger single sales. Small objects remain economically useful. Detailed objects express taste and satisfy different orders; they do not make short-session players earn less per minute.

### Sale and ownership rules

- Market sales are available on demand at the displayed deterministic price. No waiting for a simulated buyer or online market.
- Each object can be sold once. Sale, wallet credit, order delivery, milestones, and receipt settle atomically.
- Keeping an object moves it to the showroom and gives no coins. A later sale uses the same pinned value once. Moving it on the shelf gives no reward.
- Donating is an explicit final disposition with the reward disclosed first. A donation cannot also be sold.
- Salvaging refunds the exact material deposit once, with no workmanship payment. Its focus remains in personal history and cannot be reallocated. Explain this before the press.
- Workshop facilities and staff are permanent unlocks. They cannot be sold back for coins. Display their total cost before funding.
- No raw-material trading, scarcity speculation, taxes, rent, wages, interest, real purchases, or payments between players.
- A material reservation is allowed only when the wallet can cover it. There is no debt. Open work may be salvaged, or the free spoon recipe may restore cash.

### Commissions

Keep three offers available, with at most two accepted at once. Each asks for one unlocked recipe and a reachable finish, with one fictional customer and a short reason for the object. The first stool order is fixed. Later offers come from a deterministic local sequence of bundled templates. The board never offers an unavailable specialist or inaccessible recipe.

Offers do not expire, use real dates, or improve while the app is closed. A person may replace an unaccepted offer or release an accepted order without charge. Refreshing never awards money or reputation. Identical effort earns identical bonuses, so board refresh cannot produce a better payout multiplier.

A matching ready object may fulfill an order, including one made before acceptance, provided it has not been sold, donated, or assigned to another delivery. Attach at most one object to one accepted order. Higher finishes are permitted; the required finish alone sets bonus eligibility. Show the exact delivered object and final amount before the press.

### Coin sinks and progression

Coins pay for material deposits, workshop improvements, one-time staff welcoming costs, and optional furnishing projects. Optional furnishings require their own focus and material cost; they do not improve sale rates. Stable income, reversible material reservations, and the zero-cost spoon prevent a cash dead end.

Avoid an endless exponential price ladder. Long-term goals are authored larger objects, collections, visual workshop improvements, and community builds. A completed workshop remains a useful focus companion; there is no prestige reset that takes it away.

### Calculated example progression

A deterministic arithmetic review on 2026-10-27 checked all sixteen recipe price variants, the mixed-object stage totals, and this solvent route. It uses only the starter stool commission bonus; every later object sells at its ordinary market price. It grants no extra starter money and makes no purchases outside the game. These results establish that the proposed route can be funded, not that its pacing is enjoyable.

The route makes a stool, birdhouse, spoon, and toy boat; builds the carpenter's room; makes a keepsake box; welcomes the apprentice; makes a shelf and D2 stool; builds the joinery bench; makes a desk, chair, and cabinet; builds the forge and welcomes the blacksmith; makes a lantern, chest, garden bench, and standing lamp; builds the yard; welcomes the carver and finisher; and completes the greenhouse. Construction and onboarding minutes are included and earn no sale income.

| Milestone completed | Cumulative focus | Coins remaining |
| --- | ---: | ---: |
| Carpenter's room | 100 min | 166 |
| Apprentice | 150 min | 181 |
| Joinery bench | 275 min | 286 |
| Working forge with blacksmith | 625 min | 576 |
| Craft yard | 1,140 min | 1,161 |
| Full crew | 1,180 min | 801 |
| Greenhouse | 1,540 min | 621 |

The working forge occurs at 10 hours 25 minutes on this route, and the greenhouse at 25 hours 40 minutes. This is one varied play path, not a minimum, a daily quota, or a retention forecast. People who keep objects or choose more detail will take a different route. Prototype playtests should specifically check whether the forge arrives too late and whether late-game coin sinks are sufficiently interesting.

## 8. Workshop progression

Thresholds use lifetime accepted focus, including construction, onboarding, practice, and banked time. Selling, allocating the bank, or moving inventory never counts it again. Recipe-breadth requirements count distinct base recipes finished once, regardless of sale or keeping; details and repeated copies do not count as new recipes.

| Improvement | Requirements to fund | Coin cost | Build effort | Result |
| --- | --- | ---: | ---: | --- |
| Starter bench | Open workshop | Included | None | Six recipes, maker, one lane, two open jobs |
| Carpenter's room | 60 min focus; three distinct starter recipes complete | 120 | 20 min | Larger scene, four open jobs, apprentice available |
| Joinery bench | Carpenter's room; 240 min focus; five distinct starter recipes complete | 180 | 30 min | Chair, desk, cabinet; detailed joinery visuals |
| Forge extension | Joinery bench; 480 min focus; one advanced wooden object complete | 360 | 60 min | Forge room and blacksmith recruitment; metalwork begins after onboarding |
| Craft yard | Working forge; 1,000 min focus; one metal and one mixed object complete | 600 | 120 min | Three lanes, six open jobs, carver and finisher available, community build |

Fund and then build an improvement. Payment alone never makes it usable. Funding deducts coins once and creates a construction job. Construction consumes focus and never creates a saleable object or coins. A funded unfinished improvement may be cancelled with a full coin refund; its applied time remains practice history and is not returned to the bank. After completion it is permanent.

Do not count open construction or onboarding against the saleable-job cap. Keep at most one improvement and one onboarding job active at a time. This prevents filling every slot from blocking the next facility or staff member. The free spoon may always replace a salvaged saleable job.

All future requirements remain inspectable from the start. Show cost, required focus, prerequisite objects, and the work needed after funding as separate facts. Avoid promising a calendar date of completion.

## 9. Staff and workshop life

| Worker | Availability | Welcome cost | Onboarding | Skills and purpose |
| --- | --- | ---: | ---: | --- |
| Maker | Start | Included | None | Basic carpentry, joinery after its bench, general assembly, ordinary finishing, workshop construction |
| Apprentice | Carpenter's room and 120 min lifetime focus | 90 | 15 min | Basic carpentry and material preparation; opens the second work lane |
| Blacksmith | Completed forge extension | 160 | 20 min | All metal stages, metal finishing, mixed-object fittings |
| Carver | Craft yard | 180 | 20 min | Additional wood-detail patterns and collection variants; can take carpentry/detail stages |
| Finisher | Craft yard | 180 | 20 min | Additional finish palettes and collection variants; can take wood/metal finishing stages |

The maker remains present. The first release has these four recruitable staff, with no duplicates. Names and short biographies are fictional authored content, localized in English and Turkish. Custom nicknames are optional display text. Staff have no hunger, morale debt, absence penalty, death, wage bill, or real-person performance score.

Welcoming costs represent fitting out a place for the person, paid once. Onboarding uses workshop effort and activates the worker only when complete. If onboarding is cancelled, refund its welcome cost once and retain used effort as non-reusable history. Completed recruitment is permanent. Workers can be reassigned between sessions without cost; off-duty staff remain part of the scene.

There are at most three simultaneous work lanes, even with a full roster. An ineligible worker cannot receive an allocation. Show “A blacksmith can do this part” and the route to welcoming one. The maker can always perform construction and onboarding, so no improvement requires the specialist it unlocks.

Staff experience is descriptive, not an earnings multiplier. Track time actually applied through that worker; bank application counts once at allocation. Suggested visual milestones at 60, 180, and 360 allocated minutes unlock a short conversation or cosmetic pose. Reassignment, retries, or finishing an object cannot add the same experience twice. Pattern choices never change the pinned price or required effort.

## 10. Community and long-term play

The first release has one substantial community project: a **neighborhood greenhouse**. It becomes available at the craft yard and waits indefinitely.

- Material cost: 180 coins, reserved once.
- Work: two wooden panel stages of 80 minutes each, an iron frame of 100 minutes, and assembly of 100 minutes. Total: 360 minutes.
- Material accounting: 40 + 40 + 60 + 40 = 180 coins. Glass is part of the material deposit, not an unshipped glassmaking trade.
- Wooden panels and the frame can be worked on in parallel lanes. Assembly waits for all three.
- Reward: a persistent greenhouse scene, an authored thank-you note, and a commemorative workshop display. No coin payout, rate boost, or repeatable donation reward.
- Before funding, say clearly that this is a community gift. Cancellation before final delivery refunds materials once; no used effort returns.

After completion, ordinary commissions, all recipes, collections, workshop decoration, focus history, and the showroom continue. Collections use distinct recipe/finish/pattern combinations, not enormous repetition counts. No daily attendance system or limited-time content is needed.

Later content candidates are pottery, weaving, leatherwork, glassmaking, stonework, musical instruments, a small boat, and a town clock. These are future directions, not first-release promises. New trades must add meaningful shared projects and stay within the public edition's free/offline contract.

## 11. Screens and states

| Screen | Main actions and information | Required states |
| --- | --- | --- |
| Workshop | Original scene, selected job, next stage, crew, coins, start focus | New workshop; active work; ready object; no selected job; read failure |
| Session setup | Optional intention/tag, countdown/count-up, target stages, worker shares, expected progress | Bank-only session; blocked stage explained; invalid shares; unsaved start |
| Focus | Calm scene, timer, pause, finish early, sound/motion controls | Running; paused; limit reached; page recovered; storage unavailable |
| Session result | Confirmed time, per-target allocation, bank remainder, completed stages, break/start options | Awaiting confirmation; saving; saved; uncertain result; zero time |
| Workbench | Recipe catalog, requirements, material cost, finish options, open jobs | Search/filter; locked with reasons; insufficient coins; slot limit; empty |
| Object | Stage diagram, focus invested, materials, finish, value, linked intention | In progress; ready; improving; sold; kept; donated; salvaged |
| Orders and market | Three offers, accepted orders, ready goods, clear sale breakdown | No ready goods; no match; deliverable; stale quote; sale already recorded |
| Workshop growth | Facility map and visible costs/requirements | Available; blocked; funded; building; complete; cancellation |
| Crew | Workers, skills, biography, allocation, welcome/onboarding | Not yet available; available; onboarding; active; off duty |
| Showroom | Kept creations, collection progress, optional personal notes, print | Empty; select/move slots; sold object removed; long text |
| Community | Greenhouse stages and result | Locked; available; building; ready to deliver; completed |
| Focus history | Day/week totals, session list, intention/tag filters, objects supported | No sessions; partial/recovered sessions; time-zone boundary; failed page |
| Preferences and help | Language, appearance, motion, sound, time zone, free/offline explanation, storage guidance | No saved preference; save failure; unavailable sound |

Primary navigation: Workshop, Workbench, Orders, Crew, Showroom, History. Growth and Community open from Workshop and remain registered discoverable pages. Preferences is secondary. Detail pages name the object or worker and have a clear way back.

Use progressive disclosure for management. The workshop scene and Focus action lead. Inventory over ten objects uses search, finish/status filters, and bounded pagination. Avoid a dashboard wall of productivity charts or a game interface that invites constant tapping.

At every save, retain entered values on failure, show success only after confirmed persistence, and clear stale success before retrying. Closing a form discards its unsaved draft. Destructive dispositions explain their exact effect. A disabled action states the unmet requirement; never show a control whose only behavior is a refusal.

## 12. Visual, sound, and accessibility brief

Use an original illustrated craft yard with warm materials, readable silhouettes, and visible stages of making. Establish a distinct maker and crew. Finished objects should look like the work shown during sessions. The initial proposed camera is a fixed three-quarter workshop view with separate spaces revealed through expansion. It is not a freely navigated 3D world.

The active stage may have a restrained loop such as sawing, planing, hammering, or polishing. The whole scene must remain understandable as a still picture. Construction stages, worker presence, and finished variants need authored images; do not substitute an icon for the central product art.

The founder's visual review on 2026-10-28 selected a procedural Three.js workshop with an animated maker, replacing the earlier illustrated-still direction. Reuse the approved Nora model: fuller proportions, continuous shoulder joints, limited wrist rotation, short navy hair without extensions, and an olive carpenter cap. Bundle the renderer and its license locally, with a still mode and a usable text fallback when WebGL is unavailable. Keep the kit's UI pieces for controls. Other illustrations may use the kit's picture-place workflow; never write into its managed picture directory.

Asset scope for the first release: workshop states for the five facilities, maker plus four staff, sixteen object families with base and two detail results, stage art that can be reused where physically sensible, and the greenhouse stages. Use short, original/cleared local sound loops. Initial packaging budget: 12 MiB for pictures, 3 MiB for sound, leaving room under the current 32 MiB store archive limit. Measure the whole export; each file must also fit the export's per-file limit. These are production budgets, not permission to reduce required gameplay.

Start light and offer an explicit dark switch using existing kit tokens. Keep application controls readable independently of illustration colours. Support reduced motion, a fully static scene, mute by default, separate ambience/effect volume, keyboard operation, visible focus, text equivalents for stage progress, and readable zoom. Do not announce each timer second to screen readers; announce meaningful state changes only. Keep the session usable in a narrow window without horizontal page scrolling.

No sound auto-plays on first opening. A completed session can give an in-page sound if enabled and the page can play it. Do not promise an alarm when Tellop or the browser is closed. A silent or static session earns the same effort.

## 13. Records and content contract

This is the field-level design to validate before the first release. The implementation declares it only in `prisma/schema.prisma`; Tellop's data tool produces migrations and the generated client. Keep the kit's Person, Note, test users, and existing migrations unchanged. Later store updates currently refuse changes under `prisma/`, so the full carpentry/forge/staff model must exist before any public release. New bundled recipes and patterns should use existing fields.

Every record is owner-scoped. The initial local app uses a server-owned owner constant. The client never supplies an authoritative owner. IDs are server-generated UUID strings. UTC instants use String, integer seconds and coin hundredths use Int with checked bounds, and status values use validated Strings from code. No Decimal, database enum, Bytes, dynamic table, trigger, nested write, or external database is needed.

Except Workshop and Preference, each kind has `id String @id`, `ownerId String`, and `createdAt String`. Mutable kinds also have `updatedAt String`. Use explicit snake_case `@map`/`@@map` names in the implementation and name these records in `app-words.json`. The list below is the complete planned domain, not illustrative placeholders.

| Kind | Fields beyond the common fields | Defaults and constraints |
| --- | --- | --- |
| Workshop | `ownerId String @id`, `name String`, `makerName String`, `coinMinor Int`, `bankSeconds Int`, `lifetimeFocusSeconds Int`, `practiceSeconds Int`, `revision Int`, `activeSessionId String?`, `createdAt String`, `updatedAt String` | Created only by Open my workshop; 4,000 coin hundredths; zero time; revision 1 after its initialization receipt. Names optional input, with localized display defaults when blank. |
| Preference | `ownerId String @id`, `language String`, `appearance String`, `timeZone String`, `motion String`, `soundEnabled Boolean`, `ambienceVolume Int`, `effectVolume Int`, `defaultMode String`, `defaultMinutes Int`, `breakMinutes Int`, `updatedAt String` | Absent row uses code defaults. Volumes 0–100; language en/tr; appearance light/dark; motion full/reduced/still. Save only on a press. |
| FocusSession | `mode String`, `status String`, `intention String`, `tag String`, `timeZone String`, `startedAt String`, `activeSince String?`, `endedAt String?`, `limitSeconds Int`, `candidateClosedSeconds Int`, `acceptedSeconds Int`, `partCount Int`, `currentPlan String`, `allocationSummary String`, `settlementOperationId String?`, `recovered Boolean` | Empty intention/tag allowed. Accepted seconds zero until settlement. currentPlan and allocationSummary are versioned validated compact JSON strings. One active id through Workshop. |
| SessionPart | `sessionId String`, `ordinal Int`, `startedAt String`, `endedAt String`, `candidateSeconds Int`, `planSnapshot String` | Immutable closed active span. Paused intervals have no part. At most 32 parts per session; final confirmation trims accepted time from the end of the candidate span sequence. |
| WorkJob | `recipeId String`, `recipeVersion Int`, `kind String`, `status String`, `chosenFinish Int`, `completedFinish Int`, `reservedMaterialMinor Int`, `appliedSeconds Int`, `saleableSeconds Int`, `specSnapshot String`, `progressSnapshot String`, `patternId String`, `finishStyleId String`, `displayName String`, `note String`, `orderId String?`, `finalizedAt String?`, `saleMinor Int?`, `showroomPosition Int?` | kind = object/improvement/onboarding/community; chosenFinish 0–2 for objects; completedFinish starts at -1 until the base is complete, then 0–2. Immutable specSnapshot pins stages, costs, role requirements, visual references, and prices. Validated progressSnapshot holds only bounded current stage state. No arbitrary JSON from a client. |
| FocusAllocation | `sourceKind String`, `sourceId String`, `ordinal Int`, `jobId String?`, `workerId String?`, `seconds Int`, `allocationKind String` | Immutable evidence of a distribution; sourceKind session/bank; allocationKind work/bank/practice. Each source/ordinal unique. No second lifetime-focus increment for a bank allocation. |
| WorkshopUnlock | `unlockId String`, `sourceJobId String?`, `unlockedAt String` | One row per owner/unlock. Records completed facilities and permanent community completion. Availability is derived; it is never saved on page open. |
| CrewMember | `staffId String`, `status String`, `nickname String`, `onboardingJobId String?`, `allocatedSeconds Int`, `joinedAt String?`, `patternMilestone Int` | One row per owner/staff; status onboarding/active. Maker is a code-owned worker identity with no recruit row; its display name belongs to Workshop. Milestones never mint coins. |
| Commission | `sequence Int`, `templateId String`, `recipeId String`, `recipeVersion Int`, `requiredFinish Int`, `requiredWorkSeconds Int`, `status String`, `objectId String?`, `acceptedAt String?`, `deliveredAt String?`, `bonusMinor Int` | status offered/accepted/delivered/released/replaced. Bonus is calculated from the pinned required work; one delivery only. |
| WorkshopOperation | `operationId String`, `revision Int`, `kind String`, `requestDigest String`, `coinDeltaMinor Int`, `bankDeltaSeconds Int`, `focusDeltaSeconds Int`, `resultSummary String` | Immutable receipt, including the exact confirmed result and affected ids. Unique owner/operationId and owner/revision. Never store secrets, browser data, or unnecessary personal text in receipts. |
| SavedExport | `kind String`, `exportFile String?`, `fromDay String?`, `toDay String?`, `status String` | Optional focus-history CSV created on a press through the kit's kept-file helper. Optional file digest only. Not a full restore format. |

Suggested database names: `small_works_workshops`, `small_works_preferences`, `small_works_sessions`, `small_works_session_parts`, `small_works_jobs`, `small_works_allocations`, `small_works_unlocks`, `small_works_crew`, `small_works_commissions`, `small_works_operations`, `small_works_exports`. Do not use a platform-reserved prefix.

Required unique rules: `(ownerId, operationId)` and `(ownerId, revision)` on operations; `(ownerId, sessionId, ordinal)` on parts; `(ownerId, sourceKind, sourceId, ordinal)` on allocations; `(ownerId, unlockId)` on unlocks; `(ownerId, staffId)` on crew; `(ownerId, sequence)` on commissions. All mutable updates and deletes include ownerId inside the statement. Validate every referenced job, worker, session, and order against that owner inside the data layer. Add owner/status/id and owner/date/id indexes for bounded reads. Keep receipts immutable and retain them to support reconciliation.

Names accept at most 80 characters, intentions 240, tags 40, and object notes 1,000. JSON snapshots are typed and validated: job spec at most 12 KiB and eight stages, job progress at most 4 KiB, session plan at most 2 KiB, operation result at most 4 KiB. Reject unknown fields and versions. No snapshot contains an executable expression, asset URL, model name, or unbounded history. Numeric totals must remain non-negative safe values within the chosen Int storage range; detect overflow before changing anything.

Persist the frozen job spec so old work survives a content update. Keep historic content ids and localized names available for sold objects and past commissions. A new app version may add recipes or staff definitions without rewriting old rows. If a future feature requires a new stored field, it needs a separate store-update decision; do not pretend schema changes are supported automatically.

### Session plans and stage allocation

During one session, use at most three fixed `(job, worker, starting stage)` lane identities. Pause may change their percentage shares, but replacing a lane identity requires settling the current session and starting another. This bounds settlement and preserves a clear history. Hold those jobs against sale, salvage, detail changes, reassignment, and bank application until the session resolves.

Within a lane, apply effort to eligible sequential stages up to its chosen finish. A role-blocked next stage banks the remainder. For mixed jobs, two lanes may name distinct independent component stages; never two lanes on the same stage or on an assembly whose prerequisites are incomplete. Allocate dependent stages only in a subsequent session or an explicit bank allocation after the prerequisite state is saved. Do not infer extra simultaneous work from animations.

The eight-stage job limit accommodates the first-release greenhouse and detailed mixed goods. Store stage progress within one bounded job record so settlement does not need one records write per animation stage. At most three jobs and three crew records change in one settlement. Merge lane results for the same job before writing it once.

At 32 session parts, require settling that segment before another resume. Preserve its accepted time and offer a fresh segment with the same intention. Count-up and countdown have the same total-effort rules. Trimming a session's duration removes seconds from the latest parts first, then allocates the retained spans using their recorded plans; never shorten history while preserving the longer reward.

## 14. Save integrity and bounded operations

All domain operations live in `lib/data/index.js` or modules inside that directory. Request handlers validate input and call named owner-scoped operations. Client state is a display and pending draft, never the authority for a wallet, price, completed stage, role, or time already awarded.

Every game mutation uses one atomic `modelBatch`. Do not use `$transaction`, SQL, or a process-local mutex as the integrity mechanism. Use a unique operation id and a monotonically increasing workshop revision:

1. Read the operation receipt first. If present with the same request digest, return its stored result without changing anything. A different digest refuses reuse.
2. Read the workshop revision and the bounded records needed to validate the action. Compare any submitted quote/revision to the current one.
3. Derive all new values on the server. Enforce balances, work requirements, roles, availability, and final dispositions.
4. In one batch, create the unique receipt for revision `r + 1`, apply the relevant changes, and update Workshop to that revision. Any uniqueness failure rolls back the whole batch.
5. All game mutations follow this rule. A competing action that read revision `r` cannot also create `(ownerId, r + 1)`. Re-read and require a fresh user decision if its quote or job changed.
6. If the reply is missing, inspect the receipt before permitting the same operation to be sent again. Never replay an unknown result with a new id.

Initialization is the same pattern: owner-specific revision 1 and unique Workshop create in a single batch. It cannot award the 40-coin starting balance twice. Preferences and CSV bookkeeping may be independent because they cannot alter game value; still confirm their saves and handle uncertain file results honestly.

For session settlement, the same batch closes the session, clears activeSessionId, applies accepted effort, updates the bank/lifetime totals, advances relevant jobs and worker experience, creates any unlocks, and records allocation evidence. Finishing an object never automatically sells it. A sale is a separate atomic operation with its own receipt. Corrections to historical notes do not recalculate coins or time.

Limits to respect in every environment: 16 records calls per request, at most four calls in flight, 32 steps per batch, 256 rows per statement, 256 argument-list items, 2,048 encoded nodes per answer, and 256 KiB per result. Read explicit scalar fields; no include, relation select, nested create, connect, or database relation aggregation. Use owner-scoped cursor pages.

| Operation | Intended maximum reads | Intended maximum batch steps | Notes |
| --- | ---: | ---: | --- |
| Workshop view | 6 | 0 | Workshop; current session; open jobs; active crew; unlocks; preferences |
| Start session | 7 | 3 | Receipt, workshop, selected jobs, crew, unlocks, current session check; receipt + session + Workshop |
| Pause/resume | 4 | 4 | Receipt + optional part + session + Workshop |
| Settle session | 8 | 16 | One parts page up to 32 rows with compact plans; final span, up to three jobs, three crew, four allocations, two unlocks, session, Workshop, receipt; coalesce duplicate targets |
| Start object/improvement/onboarding | 7 | 5 | Reserve costs with job/crew state and receipt |
| Sell or deliver | 5 | 6 | Receipt, Workshop, object, optional order, replacement offer |
| Apply bank | 7 | 14 | Same effort-conservation rules; lifetime focus unchanged |
| History page | 4 | 0 | 25 sessions or objects per page, explicit fields, no lifetime scan |

These budgets are design targets to prove against the real bounded adapter, not a waiver of its limits. Use code-derived availability rather than writing every newly available recipe. The two unlock writes cover a completed improvement and a community delivery; onboarding activates its existing crew row. A community job becomes ready at settlement and records its permanent unlock only on the separate delivery press, so ordinary settlement needs fewer steps. Increase neither platform limits nor invisible write fan-out. No per-second saves; future hosted daily limits are therefore not consumed by a ticking timer.

Do not delete financial receipts to save space. Game amounts have no real value, but users still need consistent saved progress. History may hide a note or redact its personal text without refunding time or coins. A whole-game reset is outside the first release; Tellop's existing app/data controls and documented standalone backups remain the recovery paths.

## 15. Tellop and standalone implementation boundaries

Use the current `templates/next-sqlite` payload, exactly the approved package set, JavaScript/JSX, local fonts, kit UI components, and generated records layer. Keep current package pins, lockfile, guards, and file/AI helpers. The app's own AI code is unused. Do not install a game engine or add another UI system.

Reuse existing store patterns: `store-apps/marketing-planner/lib/data/read-in-pages.js` and `tests/records-bounds.mjs` for limits; the kit's `modelBatch` for atomic changes; existing owner-scoped route patterns; `page-frame`, `app-menu`, `counts-line`, `data-table`, `card`, `button`, `dialog`, `alert-dialog`, `input`, `textarea`, `select`, `chart`, and pagination. Inspect their actual exports before implementation. Share domain functions between contained and exported execution rather than maintaining two economies.

The current standalone data layer opens local `.data/app.db` and applies shipped migrations. The exported README currently requires Node.js 24 and pnpm 11. Verify those requirements against the chosen kit at release. Bind the documented local use to loopback; exposing the single-owner app to other people is not an authorized multiplayer feature.

| Need | Declaration | Reason |
| --- | --- | --- |
| Internet | None | The app uses bundled content and local game records. Initial standalone package installation is a setup step, not a gameplay permission. |
| Files/folders | None | No access to arbitrary personal folders. A generated CSV uses the existing kept-file/download path. |
| Camera/devices | None | No microphone, camera, device access, or OS monitoring. Ordinary local sound playback does not require recording access. |
| Keys | None | No paid or external API. |
| AI allowance | None | All rules, content, and core functionality are local. |

No background job is required for completion, orders, sales, staff, or progression. Their state changes occur on explicit requests. Closed-app earnings and timed push reminders are not part of the product. Publishing later needs the released Tellop door and ownership contract; do not enable guest routes or infer multi-user safety from the current owner constant.

### Files, print, and history export

Offer a printed showroom page through the kit's print helper. Include chosen kept objects, names, focus invested, and optional notes. Make private intentions opt-in on a print. All content uses local fonts and an intentional light print layout.

Offer focus-history CSV for a selected range, with columns: session id, local date, time zone, start/end UTC, accepted seconds, mode, outcome, tag, and optional intention. Include intentions only when explicitly chosen. Guard spreadsheet formula prefixes on all text cells. Read in bounded pages; prepare a complete export before claiming it is ready. A failed page must not produce a download presented as complete. Use the existing kept-file helper and download route, never direct app file-system storage.

Use Tellop's existing app-data export/backup affordances for its edition. For standalone users, document stopping the local app, copying its complete private data directory, and restoring it with the matching supported app version. Verify that procedure in release testing. Do not imply CSV is a game backup or that either edition has cloud synchronization. Cross-edition automatic save import is deferred until a bounded, reviewed format is specified.

### Examples and starting data

Set `sampleRecords: false`. A new installation has zero Small Works records and shows onboarding. Recipes, prices, staff biographies, customers, stages, and starting defaults live in versioned code/locale files. Fictional game characters are game content, not seeded personal data.

For screenshots and tests, use explicit disposable fixture creation with fictional workshop names, intentions, staff, and objects. Keep the seed below 2,000 rows and 128 kinds; expected first-release fixtures are under 100 rows across these eleven kinds. Never publish the developer's own focus history, file paths, or private notes. A production database is not an export input.

## 16. English and Turkish words

All interface text, recipes, staff biographies, customer requests, errors, stage descriptions, help, and asset descriptions need matching English and Turkish locale keys. Personal text remains as entered. Use the kit's language file for the initial language, and an in-app preference for later changes. No runtime translation service.

| Meaning | English | Turkish |
| --- | --- | --- |
| Product | Small Works | Small Works |
| Descriptor | Your focus, made by hand | Odaklandığın zaman el emeğine dönüşsün |
| Workshop | Workshop | Atölye |
| Recipe/work selection | Workbench | Tezgâh |
| Orders | Orders | Siparişler |
| Staff | Crew | Ekip |
| Kept creations | Showroom | Sergi |
| Progress history | Focus history | Odaklanma geçmişi |
| Start | Start focusing | Odaklanmaya başla |
| Pause | Pause | Duraklat |
| Resume | Continue focusing | Odaklanmaya devam et |
| Early finish | Finish for now | Şimdilik bitir |
| Confirm time | Keep this time | Bu süreyi kaydet |
| Discard candidate time | Do not count this time | Bu süreyi sayma |
| Unassigned time | Saved effort | Biriken emek |
| Apply bank | Use saved effort | Biriken emeği kullan |
| Basic finish | Ready to use | Kullanıma hazır |
| First detail | Carefully finished | Özenle tamamlandı |
| Second detail | Finely detailed | İncelikle işlendi |
| Further detail | Add detail | Ayrıntı ekle |
| Keep object | Keep in showroom | Sergide sakla |
| Sell object | Sell for {amount} coins | {amount} sikkeye sat |
| Fictional currency | Coins | Sikke |
| Material refund | Recover materials | Malzemeleri geri al |
| Join crew | Welcome to the workshop | Atölyeye davet et |
| Break | Take a break | Mola ver |
| Uncertain save | Check saved progress | Kaydedilen ilerlemeyi kontrol et |
| Friendly return | Your workshop is ready when you are. | Hazır olduğunda atölyen seni bekliyor. |
| Free promise | Every craft and feature is free. | Tüm zanaatlar ve özellikler ücretsiz. |

Keep personal encouragement optional and brief. Never call a person lazy, unproductive, behind, or a bad employer. No promises to treat ADHD or improve health. Staff refer only to fictional craftspeople. Use normal title case, never all-caps text. Craft words such as a dining table are permitted when they describe an actual object, not data machinery.

### Draft store listing

English name: **Small Works**

English words: **Turn focus time into handmade creations. Start as a carpenter, craft and sell objects, welcome skilled workers, and grow into a workshop with a forge. Choose short sessions or a count-up timer, keep your progress, and build at your own pace. Every craft and feature is free.**

Turkish name: **Small Works**

Turkish words: **Odaklandığın zamanı el emeği ürünlere dönüştür. Marangoz olarak başla, ürünler yapıp sat, ustaları ekibine kat ve atölyene bir demirhane ekle. Kısa seanslar veya ileri sayan sayaçla kendi hızında ilerle. Tüm zanaatlar ve özellikler ücretsiz.**

Both listings must stay within the live store's name and description limits, have `languages: ["en", "tr"]`, `needs: []`, and `sampleRecords: false`. Prepare original store artwork showing real implemented screens. Do not present a drawing or a future trade as a shipped screenshot.

## 17. Verification and release acceptance

This section defines what an implementation must prove. Writing the spec does not satisfy these checks.

### Economy and game rules

1. Reproduce every price example in section 7 with integer arithmetic. Four 15-minute sessions and one 60-minute session produce identical effort and basic workmanship for the same work.
2. Settlement conserves effort for one, two, and three lanes, including odd seconds, changing shares between paused spans, stage completion, blocked stages, and bank overflow into no selected job.
3. Bank allocation changes neither lifetime focus nor coins. Allocation retries do not add staff experience again.
4. A base stool pays 72 on the market and 78 for its base commission. A D2 stool on that commission pays 183. Detail work never receives an accidental second bonus.
5. A sold object cannot be sold, donated, salvaged, or delivered again. A commission accepts exactly one matching object. Competing sale/delivery requests leave one disposition and one payout.
6. Starting, cancelling, salvaging, and retrying cannot manufacture coins. Refunds return the material deposit once; applied focus remains non-reusable history.
7. A zero-coin player can make and sell a spoon. Every progression state retains a path to more coins and usable work.
8. Construction and onboarding spend focus without sale income. Facilities and workers activate only after their jobs complete, exactly once.
9. Mixed stages total the advertised minutes and material cost. No component seconds are counted again at assembly. Staff cannot work on two lanes or bypass role requirements.
10. Repeated recipes do not satisfy distinct-recipe prerequisites. Every locked upgrade shows all unmet requirements.
11. Test an example progression path through apprentice, joinery, forge, blacksmith, mixed work, yard, and greenhouse with no purchases, network, or special balance grants beyond the initial 40 coins.
12. Keep price and progression tables in one versioned content source. A content update preserves existing jobs and their quoted prices.

### Sessions and storage

13. Pause excludes time; early finish preserves confirmed effort; reducing candidate time reduces awards consistently. Breaks and discarded sessions earn nothing.
14. Countdown overflow, count-up limit, reload, sleep/recovery, clock changes, midnight, time-zone changes, and daylight-saving boundaries never produce negative or duplicate time.
15. Two windows cannot create two active sessions. Reopening reads only; no read creates a workshop, generates saved orders, awards progress, or modifies settings.
16. Inject a lost save reply after successful settlement, sale, upgrade, and recruitment. Receipt inspection must recover the exact result without a second award or charge.
17. Run two concurrent commands from the same workshop revision. Only one revision claim succeeds; the other leaves no partial changes. Exercise the real atomic batch adapter, including duplicate-key rollback.
18. Forged owner/job/order/worker ids and unsupported snapshot fields refuse without changing another record. Test one over and under every numerical boundary.
19. Exercise all read/write bounds through the contained records adapter as well as the standalone store. No unbounded Promise.all, per-second writes, or all-history reads on the home screen.
20. Existing notes, tags, workshop names, and CSV cells render as text. Formula-leading export cells are guarded. Saving only reports success after a confirmed result.

### Experience and distribution

21. Complete the first sale, an upgrade, staff onboarding, a metal object, a mixed object, and the community project in both editions with network disabled after setup. Confirm matching outputs from identical inputs.
22. Verify the public export on a clean local setup with no Tellop account, secrets, AI entitlement, or commercial service. Verify saved progress survives restart and the documented backup/restore procedure.
23. Test English/Turkish parity, narrow/wide layouts, keyboard-only use, zoom, screen-reader session status, reduced motion, still mode, muted sound, and light/dark views.
24. Inspect all artwork and stage transitions. Measure the export's total and per-file sizes; include all asset provenance/notices needed by the selected distribution.
25. Check that every recipe, worker, detail level, facility, pattern, and community build is reachable through gameplay in both releases. Search and exercise the app for purchase, entitlement, ad, trial, and remote-content dependencies.
26. Run app tests, look checks, contained build/start, export screening, listing validation, and actual store-copy checks appropriate to the release. A passed ordinary browser prototype does not prove the Tellop package works.

### Playtest questions

Measure these during prototype evaluation rather than claiming them as established facts: how quickly a person starts the first session; whether the first five minutes show satisfying progress; whether detail choices feel worthwhile at equal earnings per minute; whether crew allocation helps or adds busywork; whether cash deposits ever feel like a barrier; and whether players still enjoy focusing after major unlocks.

Use deterministic balance calculations for price and solvency, then actual play for pacing. Focus thresholds are effort goals, not predictions of calendar-day retention. Record any numerical tuning in the versioned economy content and update this spec before release.

## 18. Delivery sequence and remaining decisions

This is a product specification, not an implementation task checklist. A later implementation plan must inspect the current code and split this scope into verifiable work units.

| Sequence | Concrete result | What it resolves |
| --- | --- | --- |
| Visual and economy prototype | Workshop, session, object reveal, and order screen; six recipes and price calculations | Original identity, basic appeal, stage clarity, economic conservation |
| Carpentry slice | Durable focus, bank, crafting/detailing, market, commissions, showroom, first expansion | Full repeatable focus-to-sale loop and recovery |
| Crew and advanced joinery | Apprentice, allocation, onboarding, advanced wooden objects | Shared effort, staffing purpose, bounded saves |
| Forge and mixed work | Forge construction, blacksmith, metal recipes, mixed stages | The promised multi-trade workshop |
| Complete first release | Craft yard, carver/finisher, greenhouse, history/exports, accessibility and both editions | Full scope in this spec, public free/offline parity |

The founder approved the animated workshop direction and requested implementation on 2026-10-28. Start with the internal carpentry slice, then retain the complete first-release scope above. Do not substitute a carpentry-only public release for the described full first release without a separate scope decision. Final names, art, recipe minutes, and coin costs can be refined through the prototype; all-free access and effort conservation remain fixed.

Before publication, use the existing export, notice, store-art, and listing workflow. Public repository creation/push and store publication remain separate actions; this document does not perform or claim them. No additional legal restriction or approval gate is invented here.

## 19. Basis and repository references

The product direction and free-distribution requirement come from the founder's Small Works conversation on 2026-10-27. Focus Friend was a category reference for the earlier research, not a source donor. This design uses crafting, material deposits, sales, cooperative trades, and workshop construction as its core. It does not reuse the Bean, knitting, socks/scarves, text, artwork, sound, code, or room catalog. Reference: [Focus Friend](https://www.yourfocusfriend.com/) and its [official listing](https://apps.apple.com/us/app/focus-friend-by-hank-green/id6742278016).

Repository grounding, read on 2026-10-27:

- `templates/next-sqlite/AGENTS.md`: records, atomic batches, no writes on reads, localized words, picture places, package and UI rules.
- `.claude/skills/port-to-store/SKILL.md` and its mapping/publishing references: spec location, export, licensing target, listing, and release workflow. Older existence/status claims in that skill are superseded by the current code and existing store apps.
- `plans/specs/store-app-builder-guide.md`: current store brief read in the main checkout; it was uncommitted when this worktree was created. The spec does not depend on publishing that unrelated file.
- `plans/specs/store-apps/celebration-board.md` and `plans/store-first-apps.md`: existing spec structure, owner-scoped records, limits, samples, and free-standing public export patterns.
- `templates/next-sqlite/lib/data/index.js`: actual `modelBatch`, local SQLite startup, and contained/standalone data routes.
- `docs/reference/areas/store-update.md`: current schema-change release restriction.
- `docs/reference/areas/app-files.md`: kept downloads, standalone file storage, and Tellop's existing app-data export.
- `plans/publishing.md`, “The surface apps use”: portable record operations and future-host constraints. This spec makes no claim that hosting is shipped.
- `tools/store-export/src/public-files.ts`: generated public license/notice/README and current standalone setup.
