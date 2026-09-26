---
name: StockSense
description: Inventory drawn as a controlled engineering drawing, where every number has a revision table behind it.
colors:
  sheet: "#f3f5f4"
  sheet-2: "#e8ecea"
  sheet-3: "#dde2df"
  ink: "#15181a"
  ink-2: "#454c52"
  ink-3: "#636b71"
  rule: "#c2c9c6"
  rule-2: "#d9dfdc"
  blue: "#2447c9"
  red: "#c8231b"
  yellow: "#ffe14d"
  yellow-2: "#ffd41f"
typography:
  title:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  section:
    fontFamily: "Barlow Semi Condensed, Barlow, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    letterSpacing: "0.045em"
  body:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: "Barlow Semi Condensed, Barlow, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.045em"
  dimension:
    fontFamily: "Barlow, sans-serif"
    fontSize: "13px"
    fontWeight: 500
rounded:
  none: "0"
  balloon: "9999px"
spacing:
  cell-x: "12px"
  cell-y: "6px"
  section: "32px"
  frame: "18px"
components:
  button-primary:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "36px"
    padding: "0 14px"
  button-primary-hover:
    backgroundColor: "{colors.yellow-2}"
  button-secondary:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "36px"
  button-danger:
    textColor: "{colors.red}"
    rounded: "{rounded.none}"
  tab-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    height: "32px"
  field-cell:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    padding: "6px 12px 4px"
  register-cell-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
---

# Design System: StockSense

## Overview

StockSense is drawn as an engineering drawing. The viewport is one sheet: a 2px ink frame inset 18px, zone numbers along the top and bottom margins, zone letters down the sides. Every screen is a numbered sheet (S-01 Floor to S-10 Team) and each opens with a **title block**. The product's promise is that every number can be proven, and a drawing is the artifact whose revisions are dated, signed and never erased.

The scene is a warehouse office under fluorescent light, used all day, so the sheet is light. The world refuses the SaaS kit of rounded white cards, soft shadows and KPI tiles, and it refuses the dark console with a single neon accent.

## Colors

Restrained, and every colour carries meaning. Nothing is decorative.

### Primary
- **Ink** `#15181a`: all lines, lettering, the selected tab and the active sheet in the register.

### Meaning colours
- **Blue** `#2447c9` (the drafter's blue pencil): dimension lines, links, focus rings, leader lines.
- **Red** `#c8231b` (revision red): revision clouds, delta flags, late, short, out of stock, destructive actions.
- **Yellow** `#ffe14d` (the checker's highlighter): "checked" (done documents, a reconciled ledger), the single next action (primary buttons), text selection, and rows touched by a leader.

### Neutral
- **Sheet** `#f3f5f4` is the ground. **Sheet-2** `#e8ecea` fills the NEXT cell and the notes. **Sheet-3** is for pressed states.
- **Ink-2** `#454c52` for secondary text and **ink-3** `#636b71` for captions. Both pass AA on the sheet.
- **Rule** `#c2c9c6` and **rule-2** `#d9dfdc` draw the light lines between schedule rows and columns.

### Named Rules
**The Meaning Rule.** Blue, red and yellow never appear without their meaning. A yellow button is always the step forward, and a red outline is always a problem.
**Never colour alone.** Every state also has a line style or a word: dashed means draft, a solid outline means ready, highlighter plus a tick means done, strikethrough means canceled, hatching means low.

## Typography

Barlow is a monoline, slightly rounded grotesque, the nearest free face to ISO technical lettering. Barlow Semi Condensed, set in caps with 0.045em tracking (the `letter` utility), is the lettering voice for captions, tags, buttons, tabs and schedule heads. Figures are always tabular.

### Hierarchy
- **Title** (2.75rem, 600): one per sheet, inside the title block.
- **Section** (lettered caps, 17px, 700) sits on the pen line of its schedule.
- **Body** (15px, 400, 1.45).
- **Caption** (lettered caps, 11px, 600, ink-3) sits in the top-left corner of every title-block cell and form field.
- **Dimension** (13px italic 500, blue) is used only on dimension lines.

## Layout

- The sheet frame is fixed. Inside it: a 48px header row (mark, Find, SCALE live cell, DRAWN BY), then the **sheet register** (one ruled cell per sheet with its number, open and late counts; the active sheet is inked solid). The page scrolls inside the frame.
- Content has a maximum width of 1520px, 32px between sections, and a 12px by 9px cell padding in schedules.
- Rank comes from **pen weight**, never from shadow: 3px for walls and plan outlines, 2px for the title block, schedule top and bottom and the frame, 1px ink for cell edges, and rule-2 for row lines.

## Elevation & Depth

There are none. There are no shadows anywhere. Overlays (detail sheets, confirm, find) sit on a 25% ink wash and are separated only by a 2px ink edge.

## Shapes

Every corner is square. The one exception is the circle: item **balloons**, process-line stations and the live dot are round because drawings draw them round.

## Components

### Title block
The page header. Cells: SHEET number, then the title and one line of plain explanation, then captioned fact cells, then a sheet-2 **NEXT** cell holding the one highlighted action. On phones the sheet number moves into a small boxed tag beside the title.

### Schedules (tables)
`.schedule` has a 2px ink top and bottom, a 1px ink rule under the lettered head, rule-2 between rows and columns, and numbers aligned right. A whole row is clickable through a stretched `.row-link`, and on hover the row takes a blue wash.

### Buttons
They are square and lettered. **Primary** is yellow with an ink edge (the next step). **Secondary** has an ink edge on the sheet. **Danger** has a red edge and red text. **Link** is blue underlined sentence case.

### Inputs / Fields
A field is a title-block cell: a caption in the corner and the value written below. Fields in a `FieldGrid` share their rules. On focus the cell takes a 2px blue outline, and on error a red edge and a red caption.

### Tabs
A row of ruled cells, with the selected cell inked solid.

### Revision cloud and delta
The revision cloud is a scalloped red SVG outline drawn round whatever has drifted from plan, drawn in once with a pen stroke. Each item inside carries a numbered red **delta** triangle.

### Stock dimension (signature)
A product's quantities drawn to scale. On hand is the hatched section and incoming is the phantom-line block. The quantity promised out is red cross-hatched. Blue dimension lines give On hand, Free and Forecast, and red chain lines mark the reorder MIN, grey the MAX.

### Leader lines (signature)
On a product record, pointing at a location fans straight blue leaders to every ledger entry that touched it. Those rows take the highlighter.

### Floor plan
Each warehouse is drawn in plan with 3px outer walls. There is one room per location, with a dashed door swing, and archived rooms are hatched.

## Do's and Don'ts

### Do:
- Open every sheet with a title block, and give it exactly one yellow NEXT action.
- Put problems in a revision cloud with numbered deltas, and say in plain words what to do.
- Draw quantities rather than tiling them: use dimension lines, schedules and plans.
- Theme the parts the browser owns: selection is yellow, the caret and focus are blue, scrollbars are ink.

### Don't:
- Don't use rounded corners, shadows, gradients or glass anywhere.
- Don't use yellow, red or blue as decoration.
- Don't put a caption above a heading as an eyebrow. Captions live inside cells.
- Don't build KPI tiles. Counts are facts in title-block cells.
