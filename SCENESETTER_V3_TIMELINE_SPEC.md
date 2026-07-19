# SceneSetter v3 — Entity IDs + Timeline Feature: Implementation Spec

**Audience:** an implementing model/developer working in this repo. Follow this
document exactly. Where it is silent, prefer the simplest implementation that matches
the existing codebase's patterns. Do not add features not listed here.

**What this builds:** the integration path from
`../Timeline/INTERCHANGE_AND_INTEGRATION.md` Part 2 — ThruLine's chronology view,
mapping wires, and conflict engine become a feature of SceneSetter, on top of a
schema migration (v2 → v3) that gives library entities stable ids.

**Reference code:** the ThruLine app at `../Timeline/` (relative to this repo) is a
working implementation of the timeline views and conflict engine, built to
`../Timeline/THRULINE_V1_SPEC.md`. Where this spec says "port," transplant and adapt
that code rather than re-implementing from prose. Where this spec's rules differ from
ThruLine's (they do — sections replace dividers, ints replace string ids, the board
replaces the manuscript strip), **this spec wins**.

**Baseline:** all file/line references below were verified against this repo at
commit `ef97e77` (branch `feature/updates_v7`). If lines have drifted, match by the
quoted code, not the number.

---

## 1. Hard requirements (unchanged from the existing app — do not regress)

1. Plain HTML/CSS/JS, no frameworks, no build step, no new external dependencies.
2. The existing CSP in every HTML page has no `'unsafe-inline'` for scripts — all new
   code lives in external `.js` files, all wiring via `addEventListener`. No inline
   handlers.
3. All user text reaches the DOM via `textContent`/`createElement` (or projects.js's
   `esc()` where HTML strings are unavoidable). This includes SVG `<text>`, tooltips,
   and conflict messages.
4. Keyboard shortcuts match on `e.code`, never `e.key` (existing pattern,
   editor.js:1913-1969).
5. Every data mutation goes through the existing 4-call tail pattern:
   `pushHistory(desc)` **before** mutating → mutate `S` → re-render what changed →
   `recordDataEdit(); saveState();`. There is no `commit()` wrapper in this codebase;
   match the repeated pattern at existing sites (e.g. `addScene`, `saveLibEdit`).
6. Undo must cover every new mutation. `snapshot()`/`applySnapshot()` (state.js:
   233-281) deep-copy fields **by explicit enumeration** — every new field added by
   this spec MUST be added to both functions, and array-valued scene fields must be
   re-spread (`[...s.field]`) exactly like `characters`/`povs` are today, or
   snapshots will alias live state.

## 2. Schema v3

`DATA_VERSION` becomes `'3'` (state.js:4). Storage keys are unchanged
(`scriptease_proj_<id>` etc. — the key names do not encode the data version).

### 2.1 New shared id counter

Top-level `nextEntId` (integer, starts at 1). **Every id minted by this spec** —
library entities, custom POVs, storylines, reveals, constraints, markers — comes from
`S.nextEntId++`. One counter across all types, so no id is ever ambiguous about what
it names. Scene ids (`nextId`) and section ids (`nextSecId`) stay on their existing
counters, unchanged.

### 2.2 Library entities gain ids

`characters`, `locations`, `themes`, `misc` entries become `{id, name, notes}`
(`id` integer from `nextEntId`). Name remains a display field; **id is identity**.
Name uniqueness within a library remains a UI-enforced rule (unchanged guards,
editor.js:75, 320) but is no longer load-bearing for references.

### 2.3 Custom POVs become a library

`povCustomNames: string[]` is replaced by `povCustom: [{id, name}]` (ids from
`nextEntId`). `povOrder: string[]` becomes an integer id array. The character-vs-
custom-POV name-collision guards (editor.js:75, 319, 365-368, 1264) are kept
verbatim in behavior — they exist for dropdown usability, not identity.

### 2.4 Scene ref arrays become id arrays

`scene.characters`, `scene.locations`, `scene.themes`, `scene.misc` become integer
id arrays. `scene.povs` becomes an integer id array where each id is either a
character id or a `povCustom` id (unambiguous — shared counter). The rule that a POV
need not be among the scene's tagged characters (editor.js:1124-1129 comment) is
preserved.

### 2.5 New scene fields (timeline)

Every scene gains, with these defaults filled by migration and by `addScene()`:

| field | type | default |
|---|---|---|
| `storylineId` | integer (storyline id) | the "Main" storyline's id |
| `alsoStorylineIds` | integer[] | `[]` |
| `anchor` | `{date: 'YYYY-MM-DD', time: 'HH:MM' \| null}` or `null` | `null` |
| `durationMin` | positive integer or `null` | `null` |
| `offscreen` | boolean | `false` |
| `reveals` | integer[] (reveal ids this scene establishes) | `[]` |
| `requires` | integer[] (reveal ids this scene depends on) | `[]` |

Invariant (enforced wherever mutated): `alsoStorylineIds` never contains
`storylineId` and has no duplicates.

### 2.6 New top-level fields

| field | shape |
|---|---|
| `nextEntId` | integer counter (§2.1) |
| `storylines` | `[{id, name, paletteIndex}]` — `paletteIndex` integer 0–9; at least one entry always exists |
| `revealsLib` | `[{id, label}]` |
| `constraints` | `[{id, type: 'before'\|'same-time'\|'offset', a, b, offsetMin?}]` — `a`/`b` are scene ids; `offsetMin` positive integer, present only for `'offset'` |
| `markers` | `[{id, label, beforeSceneId}]` — `beforeSceneId` a scene id or `null` (= at end); positions a cosmetic label line in the chronology strip |
| `chronOrder` | integer[] — every scene id exactly once (§5) |
| `dismissed` | string[] — dismissed conflict fingerprints (§9) |
| `timelinePrefs` | `{axis: 'ordinal'\|'true', threadCharId: integer\|null, pxPerScene: integer}` — default `{axis:'ordinal', threadCharId:null, pxPerScene:110}` |

**There are no dividers.** ThruLine's dividers are replaced by sections, which
already exist. Do not port dividers, divider popovers, or divider drag from
ThruLine.

Storyline lane colors come from a fixed 10-color palette per theme, ported from
ThruLine's `STORYLINE_PALETTE`/`slColor()` (`../Timeline/js/state.js:22-31`),
adapted: SceneSetter has five themes, not two — define the palette once for
dark-ish themes and once for light-ish themes and map each of the five themes to
one of the two palettes in `charts.js`-style constants. Storyline colors are NOT
user-customizable (same as ThruLine v1).

## 3. Migration v2 → v3

### 3.1 Where it runs

The exact-match version gate exists in three places; all three change:

1. **`loadState()`** (state.js:125 `if (!d || d.v !== DATA_VERSION) return false;`):
   accept `'3'` natively; if `d.v === '2'`, run `migrateV2toV3(d)` on the parsed
   object first, then continue, and `saveState()` at the end (reuse the existing
   `migrated` flag mechanism, state.js:109-121, 195). The existing v1 legacy path
   stays: v1 → v2 (existing code) → v3 (new step), chained.
2. **`importProjectJSON()`** (projects.js:486-489): accept `v === '2'` and
   `v === '3'`. A v2 file passes the **existing v2 validation gauntlet unchanged**
   (projects.js:491-628), then `migrateV2toV3(d)` runs before the blob is stored. A
   v3 file passes the extended validation (§11). Any other version: existing
   rejection alert.
3. **The sample-project loader** (projects.js, seeding path): sample JSON files in
   the repo stay v2 on disk; they route through the same import migration. Do not
   hand-edit the sample files.

### 3.2 `migrateV2toV3(d)` — algorithm

Operates on a parsed v2 project object, returns it mutated. Must be idempotent-safe
in the sense that it is only ever called on `v==='2'` data and sets `v='3'` at the
end. Steps, in order:

1. `d.nextEntId = 1`.
2. For each library in `['characters','locations','themes','misc']`, in array
   order: normalize entries (`toObj` legacy tolerance already exists,
   state.js:126), then assign `entry.id = d.nextEntId++`. Build a per-library
   `Map<name, id>`. **Duplicate names within one library** (possible in stored
   data — loadState never deduped, see projects.js:505-510 comment): the FIRST
   entry keeps the name→id mapping; subsequent duplicates still get their own ids
   but are unreachable by name — after ref rewriting, drop any library entry whose
   id appears in no scene ref array AND whose name maps to a different id (i.e.
   drop the shadowed duplicates; they were indistinguishable in the v2 UI anyway).
3. `d.povCustom = (d.povCustomNames || []).map(name => ({id: d.nextEntId++, name}))`;
   build the custom-POV `Map<name, id>`; delete `d.povCustomNames`.
4. For each scene, rewrite `characters/locations/themes/misc` through the matching
   library map (`name → id`); a name with no map entry is dropped (v2 import
   validation made this impossible for imported files, projects.js:598-628, but
   stored data is not re-validated on load — dropping matches `removeItem`'s
   existing repair behavior). Rewrite `povs`: character map first, then custom-POV
   map; an unmatched POV name gets a new `povCustom` entry minted on the spot
   (mirrors the existing backfill at state.js:183-189).
5. Rewrite `d.povOrder` names → ids through the same two maps; drop unmatched.
6. Timeline defaults: `d.storylines = [{id: d.nextEntId++, name: 'Main',
   paletteIndex: 0}]`; every scene gets the §2.5 defaults with `storylineId` = that
   id; `d.revealsLib = []`; `d.constraints = []`; `d.markers = []`;
   `d.dismissed = []`; `d.timelinePrefs` = default.
7. `d.chronOrder` = the scene ids in **manuscript order** (§5.1) — for migration
   this means: group scenes by section in `d.sections` array order, Unassigned
   group first, preserving `d.scenes` array order within each group (this is
   exactly what `renderBoard()` displays; compute it from data, not from DOM).
8. `d.v = '3'`.

### 3.3 In-place shape upgrades on every v3 load

The existing unconditional per-load normalizations (state.js:126-194: `toObj`,
povs array coercion, wordCount normalization, section-color validation, POV
backfill, povOrder filtering) are updated to the id world and kept. Add:
`chronOrder` invariant repair (§5.2) and `alsoStorylineIds` invariant repair
(§2.5), run on every load — port the logic of ThruLine's `enforceInvariants`
(`../Timeline/js/state.js:107-147`), minus its msOrder section (msOrder does not
exist here).

## 4. The identity refactor — per-file instructions

Every site below currently compares/stores **names**; each becomes **ids**. The
inventory is exhaustive — a missed site is a bug, so work through it as a
checklist. Rendering sites keep displaying names: resolve id → entity via a
per-render lookup map (build `Map<id, entity>` once per render pass, never
`.find()` in a loop).

### 4.1 state.js

- `snapshot()`/`applySnapshot()` (233-281): add explicit deep copies for every new
  field: `povCustom` (map-spread like the libraries), `povOrder`, `storylines`,
  `revealsLib`, `constraints`, `markers`, `chronOrder`, `dismissed`, `nextEntId`,
  and per-scene `alsoStorylineIds`/`reveals`/`requires` (re-spread) and
  `anchor` (`s.anchor ? {...s.anchor} : null`). `timelinePrefs` is deliberately
  EXCLUDED from snapshots (view state, not data — mirrors ThruLine's
  viewPrefs-outside-undo rule). Scene scalar fields (`storylineId`, `durationMin`,
  `offscreen`) ride along via the existing `{...s}` spread.
- `applySnapshot()` selections re-prune (274-278): `S.selections[key]` sets now
  hold ids — the prune becomes `S[key].some(x => x.id === v)`; the povs prune
  filters against the union of character ids and povCustom ids actually used.
- `saveState()` (66-77): add all new top-level fields to the written object.
- `loadState()`: version dispatch (§3.1), id-world normalizations (§3.3). The
  povCustomNames de-dup block (178-189) becomes id-based (a povCustom entry whose
  NAME collides with a character's name is dropped and scene povs referencing its
  id are rewritten to the character's id).

### 4.2 editor.js — library CRUD

- `confirmAdd()` (64-95): push `{id: S.nextEntId++, name, notes}`. Collision
  guards unchanged (still by name — UI rule).
- `saveLibEdit()` (308-356): **the rename-propagation loop (326-342) is deleted
  entirely.** Rename now edits `entry.name` only; scene refs, selections, and povs
  are untouched because they hold ids. Collision guards stay.
- `savePovEdit()` (360-390): same — the propagation loop dies; rename edits
  `povCustom[i].name` only.
- `removeItem(sec, name)` (238-260): becomes `removeItem(sec, id)`. Filter library
  by id; filter every scene's `sc[sec]` by id; clear from `S.selections[sec]` by
  id. The character-special-case (247-249) becomes: if any scene's `povs` still
  contains the deleted character's id, mint a `povCustom` entry `{id: nextEntId++,
  name: <deleted character's name>}` and rewrite those `povs` entries to the new
  id (same user-visible behavior as today: the POV survives as a custom name).
  ALSO NEW: deleting a character must null any `timelinePrefs.threadCharId` equal
  to its id.
- `removePovCustomName()` (393-403): id-based mirror, as above.
- `endLibDrag()` (1716-1748): povOrder splices ids; library reorder unchanged
  (array order is still display order).

### 4.3 editor.js — scene forms and board

- Checkbox `value` attributes in every checklist (`renderAllCk`, `renderEditCk`,
  `renderPovCk`) become the id as a string; reads parse back with
  `parseInt(c.value, 10)`. Labels still render `entry.name` via `textContent`.
- `addScene()` (479-537): ref arrays from checkbox ids; plus the §2.5 timeline
  defaults (`storylineId` = first storyline's id); plus append the new scene's id
  to `S.chronOrder`.
- `openEditMode()` (582-592), `isEditFormDirty()` (607-626), `confirmSaveEdit()`
  (687-711): id arrays throughout (dirty-compare sorts numerically).
- `deleteScene` (wherever scenes are removed): also remove the id from
  `S.chronOrder`, drop constraints where `a` or `b` is the id, and re-anchor
  markers per ThruLine's `deleteScene` re-anchor rule
  (`../Timeline/js/state.js:151-173`, chronOrder/markers portion only).
- `renderCard()` (883-928): tag spans resolve ids → names via per-render maps.
  NEW: if `scene.offscreen`, add a small `off` badge chip to the card (styled like
  the existing tag chips, muted); if the scene is in any non-dismissed conflict
  (§9), add a warn-dot (8px red dot, top-right corner of the card).
- `sceneMatchesLib()` (438-444): `.includes(id)` over id arrays; `S.selections`
  sets hold ids (toggle sites throughout editor.js follow).
- `renderPovCk()` (1214-1247): the fold-in of unknown checked names (1214-1222)
  becomes unnecessary (values are ids, only known ids are rendered) — delete that
  write-on-render behavior. `povNames()`/`usedPovNames()`/`orderedUsedPovNames()`
  (1130-1159) return `{id, name}` pairs instead of names.

### 4.4 charts.js and reports.js

- `traceItemNames()`/`computeTraceLanes()`/`computeLaneRuns()`
  (charts.js:200-243): trace by id (`(scene[traceCat]||[]).includes(id)`);
  the trace selector's option values become ids; labels stay names.
- `buildLibItemReport()` (reports.js:254-255) and `buildMatrixReport()`
  (reports.js:319, 335): filter by `item.id` membership.
- POV report grouping (reports.js:231-234, 295-298): group by POV id; display
  resolved names.
- The `validSecIds` defensive pattern (listed sites in editor.js/charts.js/
  reports.js) is untouched — sections were already id-based; it is the model for
  how the new code should treat any stale id: **treat as absent, never crash.**

### 4.5 projects.js

- Import validation: §11.
- The referential-integrity pass (598-628) becomes id-based for v3 files: every
  scene ref id must exist in the corresponding library; hard-reject on failure
  (same policy as today).
- `esc()`/project cards: untouched (project names, not entity names).

## 5. Ordering

### 5.1 Manuscript order (derived, not stored)

One new pure function in editor.js, `manuscriptOrder()`, returning the scenes
array in **exactly `renderBoard()`'s display order** computed from data (never from
DOM): the Unassigned group first, then each section in `S.sections` array order,
preserving `S.scenes` array order within every group. A scene whose `sectionId`
doesn't resolve to a real section counts as Unassigned (the `validSecIds` pattern,
editor.js:951-956). If `renderBoard()`'s grouping ever changes, this function must
change with it — add a comment on both saying so. Everything
timeline-related (wires, reveal-order checks, the manuscript ribbon §6) consumes
this function. **msOrder is never stored** — the board is the single source of
manuscript order, so it can never disagree with the timeline.

### 5.2 chronOrder (stored)

Invariant: every scene id exactly once, no strays. Repair on load (§3.3): drop
unknown/duplicate ids, append missing ids at the end. Mutations: append on scene
create; remove on delete; reorder only via timeline-view drag (§6.5). Section
moves, board drags, and board-side edits NEVER touch `chronOrder` — manuscript
order changing does not mean story-time changed. This one-way independence is the
feature's entire premise; do not "helpfully" sync them anywhere.

## 6. The Timeline view

### 6.1 Placement

A fourth mode in the existing `#view-toggle` (cards / snake / circle / timeline),
`Alt+T` shortcut (follow the `e.code` pattern; `KeyT` is unused —
editor.js:1913-1969). Like the chart views, timeline mode hides `#board` and shows
a new sibling `#timeline-host` inside `#sbscrl`'s parent (same show/hide pattern as
`#chart-host`, charts.js `openChartView`/`closeChartView`). The mode persists in
global prefs alongside `chartType`.

**Timeline mode takes the whole stage.** Entering it hides the three left panels —
`#lp` (Library), `#sp` (Sections), and `#cp` (Scene forms) — via a body-level mode
class (e.g. `body.tl-mode #lp { display:none }`), NOT by touching the user's panel-
collapse checkboxes: on leaving timeline mode, whatever open/collapsed state the
panels had is exactly restored, because it was never changed. In their place the
timeline has its own **right panel** (§6.6) with Inspector and Conflicts tabs,
mirroring ThruLine's editor layout. Rationale: the left panels' jobs are either
absorbed (scene editing → the Inspector tab, §6.6), read-only here (sections render
as ribbon separators, §6.2), or off-mode (library curation and highlight filtering
belong to the board views), and the horizontal real estate is what the two strips
need.

**The menu bar stays, with per-mode item state.** On every mode change, one new
function `updateMenuForMode()` walks the menu items and sets `disabled` (greyed via
the existing menu-item styling; do not hide items — a menu that reshuffles is worse
than one with greyed entries):

- Enabled in timeline mode: File menu entirely (export, import, back to projects),
  Edit → Undo/Redo, View → the view-mode entries and theme, Report, Help.
- Disabled in timeline mode: the board-zoom entries (Ctrl/Cmd +/−/0 — board-only
  zoom; the timeline has its own zoom slider), the panel-toggle entries (their
  panels are hidden by the mode), and Create → Character/Location/Theme/Misc
  (their add-popup and the library workflow belong to board mode; the Inspector's
  checklists render existing entries only).
- Create → New Scene stays ENABLED but changes behavior in timeline mode: instead
  of opening `#form-new` (hidden with `#cp`), it creates a scene immediately with
  §2.5 defaults and an auto-unique title ("Untitled scene", "Untitled scene 2", …
  — title uniqueness is case-insensitive, editor.js:485), appends it to both
  orders, selects it, and opens it in the Inspector tab with the title focused and
  selected (ThruLine §10.4 behavior). A "+ Scene" button in the strip header does
  the same. Keyboard shortcuts follow their menu items' enabled state — a disabled
  item's shortcut is a no-op in timeline mode.

### 6.2 Layout inside `#timeline-host`

Horizontal split first: the **stage** (strips + wires, fills remaining width) on
the left, the **right panel** (§6.6, fixed ~300px, full height) on the right. The
stage is a vertical split, ThruLine side-by-side adapted:

- **Top: chronology strip** (~60% height). One horizontal lane per storyline
  (label gutter on the left: storyline name + scene count), scenes as compact
  cards (~96×44px: title one-line ellipsized, anchor date line below in muted
  text, `fmtAnchor` format) positioned by `chronX` percent within a scrollable
  track. Port the geometry engine wholesale from `../Timeline/js/time.js`
  (`chronX`, `chronXOrdinal`, `chronXTrueScale`, `anchorTs`, `fmtAnchor`,
  `fmtGap`, `chronTrueScaleGapDivider`) into a new `timeline.js` — it is pure
  except for one `document.getElementById('track')` width read, which stays valid
  if the track element keeps the id `track` inside `#timeline-host`. Track width =
  `max(container width, pxPerScene × sceneCount)`; zoom slider (70–200,
  step 10) in the strip header persists to `timelinePrefs.pxPerScene`.
- **Bottom: manuscript ribbon** (~25% height). A single horizontal scrollable row
  of the same compact cards in `manuscriptOrder()`, each showing its section color
  as a left edge stripe and the scene's display number. Offscreen scenes render
  here (they're on the board) but at 40% opacity with the `off` badge. Section
  boundaries render as slim labeled vertical separators (section name, section
  color) — these are read-only here; sections are edited where they always were.
- **Between: the wires SVG.** Port `../Timeline/js/wires.js` `redrawWires()`
  as-is (it was rewritten July 2026 into a batched read-phase/write-phase form —
  preserve that structure, see the warning comment in it), retargeted: chron card
  → ribbon card, storyline color stroke, same hover/flag opacity rules. Hover on
  any card (chron, ribbon, or the warn-dot'd board later) highlights both cards +
  wire (`.hi` + body-class dimming, ThruLine §10.1) — and port ThruLine's
  July-2026 fix: drag-begin must call the clear-highlight helper explicitly, and
  the CSS hover-dim rule must exclude the flag class (see
  `../Timeline/styles.css:232` and its `:not(.flag)` guard).
- **Axis toggle** (Ordinal / True scale) in the strip header, persisted to
  `timelinePrefs.axis`; True scale disabled with a tooltip until ≥2 scenes have
  anchors (ThruLine §6.2 rule). **Thread picker** (character dropdown, id-valued,
  "None" default) draws the character-thread overlay curve through that
  character's scenes in the chron strip — port from `../Timeline/js/chron.js`
  `renderChronThread`, membership test `scene.characters.includes(threadCharId)`.

### 6.3 Storyline lane management

In the chron strip's label gutter: an "+ Storyline" button at the bottom; each
lane label gets hover affordances for rename (inline input) and delete. Delete
rules (port ThruLine's): refuse to delete the last storyline; deleting a storyline
reassigns its scenes' `storylineId` to the first remaining storyline and strips
the deleted id from every `alsoStorylineIds`. `paletteIndex` for a new storyline =
lowest index 0–9 not in use (wrap by reuse if >10). Every mutation uses the 4-call
tail with descriptive labels ("Add storyline", "Rename storyline", …).

### 6.4 Scene cards in the chron strip

Card contents: title, anchor line (or "—"), warn-dot if in a non-dismissed
conflict, convergence dots for `alsoStorylineIds` (port `renderConvDots`,
`../Timeline/js/state.js:36-57`: max 4 dots + "+n"). Click = select + open in
`#form-edit`. Hover = §6.2 highlight. Offscreen scenes DO render in the chron
strip (story-time exists whether or not the reader sees it) at full opacity.

### 6.5 Drag in the chron strip

Port ThruLine's chron drag (`../Timeline/js/chron.js` `_chronDrag*` family),
adapted to the mouse-event pattern this codebase already uses (it is the same
pattern — candidate/threshold-4px/active, ghost element, Escape cancels,
`e.buttons === 0` self-heal, editor.js:1583+):

- **Horizontal drag (ordinal axis only):** reorders `chronOrder` (drop slot =
  nearest card-gap across all lanes by x; the slot is a position in `chronOrder`).
  True-scale mode: horizontal reorder disabled, one-time toast "Switch to Ordinal
  to reorder by time".
- **Vertical drag (both axes):** re-lane = set `storylineId` to the target lane's
  storyline (and remove it from `alsoStorylineIds` if present, per §2.5
  invariant).
- No-op drops commit nothing. Undo labels "Move scene (time)" / "Move scene
  (lane)".

Ribbon cards are NOT draggable in v1 — manuscript order is edited on the board,
which is the feature's authority (§5.1).

### 6.6 The right panel: Inspector and Conflicts tabs

Fixed-width (~300px) column on the right edge of `#timeline-host`, two tab buttons
at the top (Inspector | Conflicts), ThruLine-panel style. The active tab is
in-memory state only (not persisted; Inspector is the default on entry).

**Inspector tab — the existing edit form, reparented, not duplicated.** There is
exactly one `#form-edit` DOM subtree in the app. On entering timeline mode, move it
(`appendChild`) from `#cp` into the Inspector tab's container; on leaving, move it
back into its original position in `#cp` (keep a reference to its original parent/
nextSibling captured once at startup). Moving a node preserves its listeners and
input state, so every existing behavior — dirty tracking, save/discard confirms,
checklist rendering, and the §7 Timing/Reveals groups — works unmodified in both
homes. Any code that shows/hides `#cp` or switches its tabs must not assume
`#form-edit` is inside it (audit the `switchTab()` path, editor.js:727, when
implementing). With no scene selected, the Inspector tab shows a muted
"Select a scene to edit it here." placeholder and the form stays hidden.

Selecting a scene (click on a chron-strip card or ribbon card): if the form is
dirty, run the existing discard-confirm flow (`#discard-cfm-modal`) first —
cancel aborts the selection change; then load the scene via the existing
`openEditMode()`. Deselection (Escape per the priority list, or clicking empty
track space) returns the placeholder.

**Conflicts tab:** specified in §8. The strip-header "Conflicts (N)" badge button
(§8) activates this tab.

View-switch guard: leaving timeline mode (or entering it) with a dirty form also
runs the discard-confirm flow before the mode change proceeds.

### 6.7 Markers

Right-click on empty chron-track space → context menu "Add marker here" (compute
`beforeSceneId` = nearest scene to the right in chronOrder by x). Click a marker
label → popover with text input + Delete. Port from `../Timeline/js/chron.js`
(marker rendering, popover, context menu) INCLUDING its July-2026
`closeMarkerContextMenu()` helper pattern — every close path (outside click,
re-open, Escape, action button) must remove both the menu element and its document
listener. Marker Escape handling joins the existing `ESCAPE_ACTIONS` priority list
(editor.js) rather than a second keydown listener.

## 7. Scene form additions

In `#form-edit` only (the New Scene form stays lean; new scenes get defaults):

- **Timing group** (collapsible, styled like existing form groups): storyline
  `<select>` (id-valued); "Also part of" checklist of other storylines; anchor
  date `<input type="date">` + time `<input type="time">` + a clear button;
  duration `<input type="number" min="1">` (minutes, blank = null); offscreen
  checkbox labeled "Offscreen (happens, but the reader never sees it)".
- **Reveals group:** two checklists over `revealsLib` — "This scene reveals" →
  `scene.reveals`, "Requires knowing" → `scene.requires` — plus an inline
  "+ reveal" input that mints `{id: nextEntId++, label}` into `revealsLib` and
  checks it. A revealsLib entry referenced by no scene in either list is garbage-
  collected on save (keeps the library from accumulating orphans; matches
  ThruLine's inspector behavior).
- Dirty-tracking (`isEditFormDirty`) and save (`confirmSaveEdit`) extend to all
  new fields; anchor date/time validate as real calendar values via the native
  inputs (do not hand-roll regexes — this is the fix for the gap noted in
  ThruLine's spec §13.2 known-gap block).
- **Constraints are NOT editable in v1** of this feature (no UI); the engine
  checks them if present in imported v3 data. (ThruLine had constraint UI; cutting
  it is deliberate scope control — revisit after the feature soaks.)

## 8. Conflict engine

Port `../Timeline/js/conflicts.js` into `conflicts.js` here, mechanically adapted:

- Scene/entity ids are integers; fingerprints are the same strings with integer
  ids serialized (`'bilocation:3,7:'`). `P` → `S`, `P.chronOrder` → `S.chronOrder`,
  location/character lookups by id.
- Reader-order inputs (reveal-before-shown checks) use `manuscriptOrder()`
  filtered to `!offscreen`. Chronology inputs use `chronOrder`/anchors. Offscreen
  scenes still participate in bilocation and anchor-order checks (they happen in
  the story world) but never in reader-knowledge checks.
- The four check families port unchanged: anchor-vs-chronOrder monotonicity
  (adjacent anchored pairs), constraint violations + constraint-cycle DFS,
  bilocation (shared character, different locations, overlapping intervals),
  reveal-before-shown / reveal-missing.
- Recompute: debounced 150 ms after every `saveState()` (add the single call
  there — it is the one funnel that does exist), primed once on editor load.
- **UI:** the right panel's Conflicts tab (§6.6). A "Conflicts (N)" button in the
  timeline strip header (badge counts non-dismissed) activates that tab. Tab
  content: each conflict = severity dot, title, message, "show scenes" (flag
  mode: `.flag` red ring on the involved cards in strip + ribbon, everything else
  dims — reuse ThruLine's flag CSS with its specificity fix) and
  "mark intentional" (adds fingerprint to `dismissed`; dismissed list renders
  grayed at the panel bottom with "restore"). Escape clears flag mode via
  `ESCAPE_ACTIONS`. Stale dismissed fingerprints are pruned on save (port
  `pruneDismissed`). Warn-dots appear on chron-strip cards, ribbon cards, and
  board cards (§4.3) — board dots render regardless of which view is active, so
  conflicts are discoverable without opening the timeline.

## 9. Offscreen semantics outside the timeline

Minimal and explicit — offscreen scenes remain fully visible, editable, draggable
board cards. The ONLY behavior changes: the `off` badge (§4.3); exclusion from
reader-knowledge conflict checks (§8); 40%-opacity treatment in the manuscript
ribbon (§6.2); and `updateCount()` (editor.js:1089-1101) renders
"Showing N scenes (M offscreen)" when M > 0. Charts, reports, and word-count
weighting treat offscreen scenes exactly as before (no change in v1 — revisit
only if users ask).

## 10. Persistence, undo, and the version gates — integration summary

- `saveState()`: writes all new fields (§4.1); triggers the conflict recompute
  debounce (§8).
- `snapshot()`/`applySnapshot()`: §4.1. Undo/redo's render tail (state.js:296,
  306) additionally calls the timeline render + wires redraw when timeline mode is
  active, and the conflict recompute.
- The three version gates: §3.1.
- Export (`exportProjectJSON`, projects.js:369-416) is a storage passthrough and
  needs NO structural change — v3 blobs export as v3 files automatically.

## 11. Import validation for v3 files

Extend `importProjectJSON`'s allow-list style (hard-reject with a specific
message; never silently repair, except where noted). For `v === '3'` files, in
addition to the existing v2 checks (adapted to id arrays):

- Library entries: `{id: positive integer, name: string}`; ids unique across ALL
  id-bearing collections in the file (libraries, povCustom, storylines,
  revealsLib, constraints, markers — one shared counter means one shared
  uniqueness check); `nextEntId` > every such id (auto-repair upward like the
  existing `nextId` repair, projects.js:563-572).
- Scene ref arrays: integer arrays; every id resolves to the right collection
  (characters/locations/themes/misc respectively; povs resolve to characters ∪
  povCustom). Hard reject on dangling refs (existing policy).
- New scene fields: `storylineId` resolves to a storyline; `alsoStorylineIds`
  integer array, no duplicates, not containing `storylineId`, all resolving;
  `anchor` null or `{date, time}` with a **real calendar date** (construct a
  `Date` and verify round-trip, not regex-only) and `time` null or `HH:MM` in
  00:00–23:59; `durationMin` null or positive integer; `offscreen` boolean;
  `reveals`/`requires` resolve to `revealsLib`.
- `storylines` non-empty; `paletteIndex` integer 0–9. `constraints` well-formed
  (§2.6) with `a`/`b` resolving to scenes. `markers` labels strings,
  `beforeSceneId` null or resolving. `chronOrder` exactly the scene-id set, no
  duplicates. `dismissed` strings. `timelinePrefs` if present: `axis` in the enum,
  `threadCharId` null or resolving to a character, `pxPerScene` integer 70–200 —
  fully validated, never merged blind (this was ThruLine's one validation hole;
  do not reproduce it).
- Unknown fields: keep the existing passthrough behavior (do not strip) — that is
  the compatibility affordance future versions and the interchange sidecar design
  rely on.

## 12. Milestones

Build and verify in this order; each milestone leaves the app fully working.

- **M1 — Schema + migration, no UI change.** §2, §3, §4.1, §5.2 repair, §10
  persistence, §11 validation. The app runs on v3 data with the UI still
  functionally identical (checkbox values now ids, renders unchanged). Gate: full
  §13 checks 1–6.
- **M2 — Identity refactor of existing UI.** §4.2–4.5 complete; rename
  propagation loops deleted. Gate: checks 7–10.
- **M3 — Scene form Timing/Reveals groups** (§7) + offscreen board behavior (§9).
  Gate: checks 11–13.
- **M4 — Timeline view shell + strips: panel/menu mode switching, right panel
  with reparented Inspector, strip, ribbon, wires, lanes, zoom, axis, thread**
  (§6.1–6.4, §6.6). Gate: checks 14, 14a, 14b, 15–17.
- **M5 — Chron drag + markers** (§6.5, §6.7). Gate: checks 18–19.
- **M6 — Conflict engine + panel + warn-dots** (§8). Gate: checks 20–22.
- **M7 — Polish + full verification** (whole §13, all five themes, both a fresh
  project and a migrated sample).

## 13. Verification checklist

1. Load a stored v2 project → migrates in place, `v:'3'` persisted, every checkbox
   /tag/report renders identically to before migration (compare against a v2
   screenshot).
2. Import a v2 export file → same result; import the SAME file again → uid
   conflict flow works as before.
3. Migration of a file with duplicate library names collapses the shadowed
   duplicates without losing any scene tags.
4. Export a migrated project, wipe storage, import it → deep-equal round trip.
5. Undo/redo across 10 mixed operations (incl. a storyline op and an anchor edit
   once M3+ lands) fully reverses; `timelinePrefs` changes do NOT create undo
   steps.
6. Import validation rejects, with specific messages: a dangling character id, a
   duplicate entity id, `anchor: {date:'2020-13-45'}`, `chronOrder` missing a
   scene, `timelinePrefs.axis: 'bogus'`.
7. Rename a character used on 30 scenes → instant, every tag/report/chart shows
   the new name, POV intact. (The old propagation loop is gone — verify via a
   scene open in the edit form during the rename: no dirty flag appears.)
8. Delete a character who is also a POV → POV survives as a custom POV with the
   same name (existing behavior preserved), thread picker resets if it pointed at
   them.
9. Two entities with the same name in different libraries (a character and a
   location both named "Paris") coexist and filter independently.
10. Charts trace mode and both report types work by id: rename an entity while a
    report is open, regenerate → new name everywhere.
11. Edit-form Timing group round-trips every field (edit → reload → persisted);
    native date input rejects impossible dates; clearing the anchor works.
12. Reveals: create via inline add, tag on scene A (reveals) and scene B
    (requires); untag both → the orphan revealsLib entry is gone after save.
13. Offscreen toggle: board card gets the badge, count label shows "(1
    offscreen)", charts/reports unchanged.
14. Timeline view opens via toggle and Alt+T; the three left panels disappear and
    the right Inspector/Conflicts panel appears; lanes match storylines; ordinal
    spacing even; cards ellipsize long titles; selecting a scene loads the
    (reparented) `#form-edit` in the Inspector tab; editing + saving there works
    identically to board mode.
14a. Mode round-trip: collapse the Sections panel, enter timeline mode, leave →
    Sections panel is still collapsed, Library/Scene panels restored exactly;
    `#form-edit` is back in `#cp` and works (open a scene from the board to
    prove it). Switching modes with a dirty form triggers the discard-confirm;
    Cancel keeps you in the current mode with edits intact.
14b. Menu state in timeline mode: board-zoom, panel toggles, and Create →
    Character/Location/Theme/Misc are greyed and their shortcuts are no-ops
    (Ctrl/Cmd+0 does nothing); File/Undo/Redo/Report/theme/view items work. New
    Scene (menu, strip-header button, and Alt+N) creates "Untitled scene N" with
    defaults, appends to both orders, and opens it in the Inspector with the
    title focused. Leaving timeline mode restores every menu item.
15. True scale: disabled below 2 anchors (tooltip); with anchors, positions scale
    linearly; large-gap divider label appears when one gap > 5× median; axis
    choice persists per project.
16. Wires glue to card edges during scroll of either strip and window/panel
    resize; hover highlights both cards + wire and dims the rest; **after a drag,
    nothing stays dimmed** (the ThruLine stale-hover regression test).
17. Thread picker: pick a character → curve through their chron cards; renaming
    that character mid-thread keeps the thread (id-based).
18. Chron drag: reorder updates chronOrder only (board order visibly unchanged);
    lane drag re-lanes; Escape cancels cleanly; drop outside the window
    self-heals; every drag undoes/redoes.
19. Markers: add via right-click, rename via popover, delete; two successive
    right-clicks never leave a stray menu; Escape closes menu before clearing
    selection (priority list).
20. Conflicts: build the bilocation case (shared character, two locations,
    overlapping anchored times) → error appears within ~150 ms of save; "show
    scenes" flags cards in strip AND ribbon AND board; hovering while flagged does
    NOT dim flagged cards (the specificity regression test); "mark intentional"
    dismisses and survives reload; fixing the data prunes the dismissed
    fingerprint.
21. Reveal-order: scene requiring a reveal placed before the revealing scene in
    board order → conflict; drag the board card (not the timeline) to fix it →
    conflict clears, proving manuscript order flows from the board.
22. An offscreen scene in a bilocation conflict still flags; an offscreen scene
    "requiring" a reveal does not.
23. Console clean throughout; CSP untouched; zero `innerHTML` with entity/scene
    data (grep); set a scene title and a storyline name to
    `<img src=x onerror=alert(1)>` → literal text everywhere including SVG and
    conflict messages.
24. All five themes: storyline colors readable, wires visible, flag/hover states
    distinct.

## 14. Out of scope (do not build)

Dividers (sections replace them) · constraint-editing UI (engine only, §7) ·
braid view · ribbon drag-reordering · custom storyline colors · offscreen
exclusion from charts/reports · ThruLine-file import (separate future work; the
interchange design lives in `../Timeline/INTERCHANGE_AND_INTEGRATION.md`) ·
split-pane/minimap/virtualized rendering · any change to the Projects page beyond
the version gates.
