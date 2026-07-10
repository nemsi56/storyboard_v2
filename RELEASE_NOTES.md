# Release Notes — `feature/updates_v1`

This file documents what shipped on the `feature/updates_v1` branch, pushed to `origin`
on 2026-07-10. For granular, item-by-item tracking (including what's still proposed or
deferred), see `FEATURE_ROADMAP.md`.

---

**Backups & Project Management**
- Passive "Backed up N ago" status indicator, dismissible overdue-backup banner (recurs
  hourly), and a browser "leave site?" warning on unexported changes.
- Fixed a bug where the "Projects" button silently skipped the unexported-changes warning.
- New Project naming modal (prefilled, pre-selected "Untitled Project").
- Removed the dead "Save" menu item (app already autosaves); `Ctrl+S` is now a documented
  no-op.

**Scene Editing**
- New Word Count field.
- New POV field — multi-select, sourced from Characters + a growable custom-name list,
  since scenes here often represent whole chapters with multiple narrators.
- "+ Add [category]…" shortcut inside every scene-form checklist, without losing
  in-progress form data.
- "Discard changes?" confirmation when closing a scene with unsaved edits.
- Fixed checked-item state getting silently wiped when the library was edited mid-form.

**POV, throughout the app**
- Read-only POV section in the Library panel for highlighting scenes (fully wired into
  the existing AND/OR engine).
- POV shown as its own row on Scene Board cards (respects "Show Card Details").
- POV added to Reporting at parity with other categories: new POV report type, POV
  checkbox on the Scene List report, POV axis on the Cross-Reference matrix.
- Overview and Tutorial pages updated to document all of the above.

**Scene Flow Chart**
- Fixed POV highlighting not working in either chart layout.
- New "Unassigned" indicator (snake marker + circle wedge) shown only when scenes lack a
  section, correctly ordered first to match the chart's actual layout.
- Zoom slider and "Show Card Details" checkbox now hide while chart view is open instead
  of sitting there inert.
- Fixed the circle chart's section label disappearing when a section filter narrows the
  board down to a single section.

**Colors & Printing**
- Fixed the POV tag color clashing with another library category's color in four of the
  five themes (Ivory, Studio, Ocean, Sunset) — picked new POV hues with better hue
  separation from Characters/Locations/Themes/Misc in each.
- Fixed chart printouts on dark themes being nearly unreadable (dark-on-dark section
  dividers and text) — printouts now always resolve against a fixed light palette
  regardless of the active on-screen theme.
- Made circle chart section dividers visible on dark themes on-screen, not just in print.

**Bug fixes**
- Alt+N/C/L/T/M/R/V keyboard shortcuts now work on Mac (previously broken — Option remaps
  the key character, e.g. Option+V → "√").
