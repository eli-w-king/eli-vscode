# Agents Window Layout

This document describes the layout structure and concepts for the Agents Window workbench.

---

## 1. Overview

The Agents Window workbench (`Workbench` in `sessions/browser/workbench.ts`) provides a simplified, fixed layout optimized for agent session workflows. Unlike the default VS Code workbench, this layout:

- Does **not** support settings-based customization
- Has **fixed** part positions
- Excludes several standard workbench parts (activity bar, status bar, banner)

---

## 2. Layout Structure

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                  Titlebar                                    │
├─────────┬───────────────────────────┬───────────────┬───────────────────────┤
│         │       Sessions Part       │ Editor (hid.) │     Auxiliary Bar     │
│ Sidebar ├───────────────────────────┴───────────────┴───────────────────────┤
│         │                              Panel                                 │
└─────────┴────────────────────────────────────────────────────────────────────┘
```

The **Sessions Part** is the primary content surface. It hosts an internal grid of one or more **Session Views** (left-to-right) — see [§4 Sessions Part](#4-sessions-part) for the visibility model.

Editors open as modal overlays via `ModalEditorPart`. The main editor part exists in the workbench grid but is hidden by default.

### 2.1 Parts

| Part | Position | Default Visibility | Purpose |
|------|----------|-------------------|---------|
| Titlebar | Top, full width | Always visible | Session picker, toggle actions, account widget |
| Sidebar | Left, below titlebar | Visible | Sessions list |
| Sessions Part | Center of right section | Visible | Grid of one or more session views (each rendering the active chat of its session) |
| Editor | In grid, beside Sessions Part | Hidden | Shown modally for file/diff workflows |
| Auxiliary Bar | Right side | Hidden (retired) | Formerly Changes/file tree — now superseded by the per-card lower region |
| Panel | Below Sessions Part + Aux Bar | Hidden | Terminal, debug output |

> **Per-card lower region.** The Changes/Files auxiliary-bar panel has been retired. Each session card's area under the title separator (the `.session-view-content` slot) shows the chat **transcript** by default, or a simplified per-card **Files** tree / **Changes** list, toggled from the session header: the folder label toggles Files and the diff stats toggle Changes (mutually exclusive; click the open trigger again to return to the transcript). The panels are bound to that card's own session (`InCardFilesView` / `InCardChangesView`, created via the `IChatViewFactory` seam) and a row click opens the file/diff in the modal editor over the cards. The shared input is disabled while the active card shows Files/Changes. See `SessionView` (lower-region state) and `SessionHeader` (triggers). The auxiliary bar is kept hidden by `SessionLayoutController._syncAuxiliaryBarVisibility`, and the title-bar **Toggle Side Panel** button was removed.

### 2.2 Grid Tree

```
Orientation: VERTICAL (root)
├── Titlebar (leaf, full window width)
└── Content Section (HORIZONTAL)
    ├── Sidebar (leaf, 300px default)
    └── Right Section (VERTICAL)
        ├── Top Right (HORIZONTAL)
        │   ├── Sessions Part (leaf, remaining width)
        │   ├── Editor (leaf, hidden by default)
        │   └── Auxiliary Bar (leaf, 340px default)
        └── Panel (leaf, 300px default, hidden)
```

The titlebar spans the full window width at the root level. Below it, a content section holds the sidebar (left) and the right section. The Sessions Part itself contains an **internal** horizontal grid (one leaf per visible session) — that grid is private to the part and is not part of the workbench grid above.

The **Sessions Part is the flexible ("remaining width") view** in the top-right row: it has `LayoutPriority.High` so it absorbs auxiliary bar / editor visibility changes and window resizes. The editor and auxiliary bar keep their user-set widths (`LayoutPriority.Normal` / `Low`). Making the editor the high-priority view caused its width to drift to its 300px minimum when the auxiliary bar was toggled across session switches.

The Sessions Part-to-Editor gap and the gap above the bottom Panel share `AGENTS_FLOATING_PANEL_GAP` in TypeScript layout and its registered CSS token, `--vscode-agents-layout-floatingPanelGap`. Their grid sashes keep the split boundaries unchanged, but expand and shift their hit areas to fill those visual gaps exactly. Each shows the standard persistent three-dot gripper at rest and yields to the full sash highlight while hovered or dragged. The Auxiliary Bar's leading padding and part-internal sashes retain their independent geometry.

### 2.3 Layout Priority Model

The workbench grid is built with `proportionalLayout: false` (see `createWorkbenchLayout()` in [browser/workbench.ts](src/vs/sessions/browser/workbench.ts)). In this mode the split views do **not** distribute resize deltas proportionally — instead each delta (window resize, or a part being shown/hidden) is absorbed by the highest-`LayoutPriority` view, while the others keep their established sizes. Each part therefore declares an explicit `priority`:

| Part | `LayoutPriority` | Width behaviour |
|------|------------------|-----------------|
| Sidebar | `Low` | Fixed user-set width; never absorbs deltas. `minimumWidth` 170 (270 web), `maximumWidth` ∞, snaps closed below the minimum. |
| Sessions Part | **`High`** | The single flexible view — grows/shrinks to absorb every horizontal delta. `minimumWidth` 300, `maximumWidth` ∞. |
| Editor | `Normal` | Keeps its user-set width (`600` default); only resized via its own sash. |
| Auxiliary Bar | `Low` | Keeps its user-set width (`340` default); only resized via its own sash. |

In the single-pane detail-panel layout, first-run sidebar width is slightly narrower (280px) so a typical window keeps roughly balanced chat and third-pane widths when the pane is shown. Persisted `_savedPartSizes` always win over these defaults.

**Invariant — exactly one `High` view in the horizontal chain.** A grid branch derives its priority from its children (`BranchNode.priority` in [base/browser/ui/grid/gridview.ts](src/vs/base/browser/ui/grid/gridview.ts)): `High` if any child is `High`, else `Low` if any child is `Low`, else `Normal`. The Top Right row contains a `Low` auxiliary bar, so unless the Sessions Part is `High` the whole Right Section derives to `Low`. The Content Section would then be `Sidebar (Low) | Right Section (Low)` — two equal-priority views — and with no high-priority absorber the resize delta spreads across **both**, growing the sidebar toward half the window. The Sessions Part being `High` is what lifts the Right Section to `High` so it (not the sidebar) absorbs the delta.

> **Pitfall:** the `High` role must live on the Sessions Part, not the editor. It was previously on the editor, but that made the editor drift to its 300px minimum when the auxiliary bar was toggled across session switches. When moving the role, set the Sessions Part to `High` **and** the editor to `Normal` together — removing `High` from the editor without adding it to the Sessions Part leaves the chain with no `High` view and reintroduces the growing-sidebar bug.

---

## 3. Titlebar

The titlebar is a standalone implementation (`TitlebarPart`) — not extending `BrowserTitlebarPart`. It has three menu-driven sections:

| Section | Menu ID | Content |
|---------|---------|---------|
| Left | `Menus.TitleBarLeftLayout` | Toggle sidebar, agent host filter |
| Center | `Menus.CommandCenter` | Session picker widget (plus `Menus.TitleBarSessionMenu` for active-session actions) |
| Right | `Menus.TitleBarRightLayout` | Run script (split button), toggle auxiliary bar, account widget |

No menubar, no editor actions, no `WindowTitle` dependency.

### Session Picker (Center)

The center section shows a clickable session picker widget. When a session is active it renders:
- **Provider icon** — the session type icon (e.g. Copilot CLI, Cloud)
- **Session title** — the AI-generated or user-assigned session title
- **Workspace name** — the repository or folder name
- **Branch / worktree** — the active git branch or worktree name in parentheses
- **Changes summary** — `+insertions -deletions` when the session has pending changes

When no session is active (new chat view) the widget hides its chrome so the center is empty. Clicking opens the session switcher quick pick.

When the primary side bar is hidden and at least one session is **blocked** the widget instead switches to a **requires-input** state (see [Blocked Sessions](#blocked-sessions-center) below).

After the user approves a pending action on a session from the sessions list (e.g. the **Allow** button on an approval row), the widget briefly shows a green "Approved N sessions" confirmation. Each approval within the rolling 3s window increments the count and restarts the countdown; while visible it takes precedence over the requires-input state. Driven by `ISessionActionFeedbackService` (`contrib/sessions`), whose `approvedCount` observable the widget reads.

In the single-pane layout, activating the session header **Changes** pill is treated as an explicit
editor open: it reveals the docked editor area and opens the Changes multi-diff editor even though
managed Changes tab activations remain excluded from automatic reveal.

### Agent Host Filter (Left)

When multiple remote agent hosts are known, a dropdown pill in the left toolbar scopes the workbench to a specific host. When no hosts are known the pill acts as a re-discover trigger.

### Blocked Sessions (Center)

When at least one session is **blocked**, the center session picker widget (`SessionsTitleBarWidget`) switches from the active-session pill to a light orange "N sessions require input" state (orange label with a subtle background and border), and blinks gently twice whenever a newly blocked occurrence appears. A session counts as blocked when it needs input, or - while not in progress - has failing CI checks. Pull request comments do not make a session blocked. Raw detection is owned by the `BlockedSessions` model (`contrib/blockedSessions`), which reuses the shared, background-polled GitHub CI models and identifies CI occurrences by commit. The widget refines this into what the title bar surfaces via the `BlockedSessionsIndicatorModel` (`blockedSessionsIndicatorModel.ts`) it instantiates: it acknowledges the current occurrence when the user views the session or explicitly ignores it, applies optimistic approval dismissals, classifies the homogeneous requires-input reason (for the specific message), builds the pill label, and decides when the attention blink plays. Acknowledgement lasts only for that input request or CI failure; a later approval, a new failing commit, or an unblock-to-block transition surfaces the session again. Clicking the widget opens those sessions rendered exactly like the sessions list but flat - no sections, groups or workspace headers - via the reusable `SessionsFlatList` (exported from `sessionsList.ts`) in a dropdown anchored below the command center box using `IContextViewService`; clicking a row opens the session like the main list. Its header toolbar offers **Show All Sessions**, **Ignore All Input Needed**, and a trailing **Close** action whose hover shows the `Escape` keybinding. Its rows use `Menus.BlockedSessionsItem` instead of the main session-item toolbar menu and contribute **Ignore Input Needed** / **Ignore CI Failure** actions with the same bell-slash icon. When no session is blocked, the widget behaves as the normal active-session pill. Whether the widget enters this state is driven by the `BlockedSessionsIndicatorModel`'s `blockedSessions` observable.

Approval acknowledgement must use the pending tool call's stable id, not the approval model's load-time timestamp. Opening the new-session view can dispose and later reload the chat model; a timestamp-based id would make the same approval appear blocked again after that reload.

### Account Widget (Right)

Shows the signed-in GitHub profile image (falls back to the account codicon). Clicking opens a combined account and Copilot status panel with sign-in/sign-out and settings actions.

---

## 4. Sessions Part

The Sessions Part (`SessionsPart` in [browser/parts/sessionsPart.ts](src/vs/sessions/browser/parts/sessionsPart.ts)) is the central content surface of the Agents window. It does **not** render a chat directly — instead it owns an internal `SerializableGrid` of one or more **session views**.

### 4.1 Session View

A `SessionView` ([browser/parts/sessionView.ts](src/vs/sessions/browser/parts/sessionView.ts)) is a single leaf in the Sessions Part's internal grid. It hosts:

- A **session header** at the top ([browser/parts/sessionHeader.ts](src/vs/sessions/browser/parts/sessionHeader.ts)) — the session status icon + title, a meta row (workspace · diff stats), and the session toolbars (Run, Open in VS Code). The meta row hosts a generic `Menus.SessionHeaderMeta` toolbar that any feature can contribute actions into; the changes view contributes the diff stats as a clickable menu item (gated by the per-view `SessionHasChangesContext` key, which `SessionView` sets from the session's changes, with its custom action view item registered via `IActionViewItemService` from `contrib/changes/browser/changesActions.ts`) that, when activated, opens the multi-file diff editor for the session. Visible once the bound session is created. It is also the drag handle for the session. Right-clicking the header opens `Menus.SessionHeaderContext`, which surfaces pin view / close (`1_view`), rename (`2_edit`), and mark read / unread (`3_read`). The built-in rename action is registered from `contrib/sessions/browser/sessionsActions.ts` and uses `ISessionsPartService` to find the matching `SessionView`, which delegates to the header's inline rename control.
- A **chat view** below the header, swapped in/out based on session state.
- A floating toolbar overlay ([browser/parts/sessionHeader.ts](src/vs/sessions/browser/parts/sessionHeader.ts), `SessionViewFloatingToolbar`) shown for not-yet-created sessions in place of the header.

The header shares visual tokens via `applySessionBarThemeColors` ([browser/parts/sessionBarStyles.ts](src/vs/sessions/browser/parts/sessionBarStyles.ts)) and stylesheet ([browser/parts/media/chatCompositeBar.css](src/vs/sessions/browser/parts/media/chatCompositeBar.css)). `SessionView` uses the header's reported height to lay out the chat view below it. The header is centered and capped to 990px via its CSS class (`.chat-composite-bar.session-header-bar` in [chatCompositeBar.css](src/vs/sessions/browser/parts/media/chatCompositeBar.css)). The chat view itself is still laid out at full session width so its scrollable viewport (and scrollbar) stays flush to the far-right edge; only the inner chat content (message/input cards, via `.interactive-item-container`, capped to 950px in [browser/media/style.css](src/vs/sessions/browser/media/style.css)) is width-constrained and centered via CSS.

**Pitfall:** don't cap the chat viewport width in `SessionView` layout when you need edge-aligned scrollbars. Keep the viewport full-width and center only the inner chat content so alignment and scroll ergonomics both hold.

The chat view inside a session view is one of two kinds (`ChatViewKind` in [browser/parts/chatView.ts](src/vs/sessions/browser/parts/chatView.ts)), selected per autorun based on the bound session:

| Kind | Used when | Concrete view |
|------|-----------|---------------|
| `'newSession'` | The bound session is `undefined` **or** the session has not been created yet | `NewChatView` (workspace / session-type picker + input) |
| `'chat'` | The session and active chat are both created | `ChatView` (renders `session.activeChat`) |

Concrete implementations live under `contrib/chat/` and are obtained via `IChatViewFactory` so the `browser/` layer doesn't have to import contrib code.

The `NewChatView` input uses the control-tier corner radius for its send button, so the primary action is a rounded square in both desktop and phone layouts rather than a circular control. The focus outline follows the same control-tier shape.

`ChatView` mounts session input banners directly above the chat input. The CI failures banner uses the orange accent for the card border/icon and for the primary Fix Checks button background/border.

When a `ChatView` loads its chat model (`acquireOrLoadSession`), it surfaces progress on **its own** progress bar, pinned to the top of that grid leaf. This mirrors how each editor group owns its `ProgressBar` (see `EditorGroupView`): the bar is created by the leaf host `AbstractChatView`, wrapped in a `ScopedProgressIndicator` (reused from `vs/workbench`) with an always-active scope, and driven via `AbstractChatView.showProgressWhile(promise, delay)`. Concurrent loads in other visible sessions each show their own progress instead of competing for a single part-wide bar, and overlapping loads on the same leaf are joined by the indicator so the bar only hides once all have settled. A short delay avoids flashing the bar for fast (cached) loads.

### 4.2 Visibility Model

The set of session views in the part is driven by `ISessionsService.visibleSessions` (services — see [services/sessions/browser/sessionsService.ts](src/vs/sessions/services/sessions/browser/sessionsService.ts)), which is backed by the `VisibleSessions` model helper (see [services/sessions/browser/visibleSessions.ts](src/vs/sessions/services/sessions/browser/visibleSessions.ts)).

Key invariants:

- **Multiple visible sessions, one active.** The Sessions Part may show one or several session views side-by-side. Exactly one of them is the **active** session at any time — the one that receives keyboard focus, drives context keys, and is reflected in the titlebar / sidebar / auxiliary bar.
- **Active session is observable.** Visible and active sessions are exposed as `IObservable<readonly (IActiveSession | undefined)[]>` and `IObservable<IActiveSession | undefined>` respectively. `SessionsService` (services) owns the single reconcile autorun: it subscribes once and calls `SessionsPartService.updateVisibleSessions(visible, active)`, which forwards to `SessionsPart`. The part is a **passive renderer** — it injects neither the model nor the view.
- **One slot may be the "empty" slot.** A visible session of `undefined` represents a not-yet-created chat — its session view renders the `'newSession'` chat view (workspace picker + input). The workspace and harness pickers are capped at 400px and 200px, respectively, so long labels truncate without crowding out the other controls. At most **one** slot may be `undefined` at any time. When the user submits its first message, the placeholder transitions into a real session and the grid slot is preserved.
- **Sticky vs non-sticky.** The visibility model marks each slot as sticky (user-pinned) or non-sticky. Non-sticky slots are recycled when a new session opens; sticky slots are preserved. The empty slot is always non-sticky. This lets the user pin a session to keep it visible while still flowing through other sessions in the remaining slots.
- **Slot reuse on reconcile.** `SessionsPart.updateVisibleSessions` grows or shrinks its internal pool of `SessionView`s to match the visible count, then rebinds each surviving slot to its session by position via `SessionView.openSession(session)`. Slots are never destroyed and recreated for an existing session — only added at the right or popped from the right when the count changes.
- **Focus promotes to active.** Focus-in or pointer-down on a non-placeholder session view promotes that session to active (via `SessionsPartService.onDidFocusSession` → `ISessionsService.setActive`, which updates the active visible slot — and hence `ISessionsService.activeSession`).
- **Maximize.** When two or more non-placeholder views are visible, the active view can be maximized within the part's internal grid; the part exposes `toggleMaximizeSession(sessionId)`.
- **Restored on reload.** The visibility model is persisted to workspace storage (order, sticky state, and which slot is active, including the empty new-session slot). On startup `ISessionsService.restoreVisibleSessions()` rebuilds the grid, waiting for each session's provider to make it available and re-applying order, sticky flags, and the active session. To avoid flicker, restore waits for the active session, then lays out all sessions that are already available in one atomic transaction (`VisibleSessions.restoreGrid`) rather than showing the active session alone and reflowing as siblings load. Sessions whose provider surfaces them later are inserted into their persisted position incrementally. Once the grid has been laid out, keyboard focus is moved into the restored active session (matching the behaviour when a session is opened explicitly) so the user can start typing immediately. Focus is driven by `ISessionsService` observing its own `activeSession` (the active visible slot) rather than any model service calling into the view. The move is guarded so it never steals focus from another surface: focus is pulled into a session only when it currently rests on `<body>`/nothing (startup restore) or already within the grid (moving between leaves), so an incidental active-session change (e.g. the fallback after deleting a session from the list) does not yank focus out of the list. Deliberate opens originating elsewhere move focus via their own explicit `focusSession` call. Restore must win the race against the empty new-session slot, whose workspace picker resolves asynchronously on the same provider-registration event restore waits for and would otherwise create and activate an untitled draft. Three mechanisms guarantee restore wins: (1) `ISessionsService` and `ISessionsManagementService` are both registered **eagerly** so the restore wiring and visibility model are alive before the first paint; (2) when restore rebinds the placeholder slot to the restored session, the new-session view (and its `NewChatWidget`) is disposed, and `NewChatWidget` guards its async workspace-selection handler with `this._store.isDisposed` so a late-resolving picker cannot create a draft for a slot that has already been claimed by a restored session; (3) untitled drafts are never persisted — `restoreVisibleSessions` drops them from the snapshot (`_snapshotVisibleSessionStates`) — so a stale draft can never be restored. The restoring state is intentionally not a UI suppression flag. (Restore itself drives no part-wide progress; once a session's leaf is laid out, that leaf shows its own load progress as described above.)

### 4.3 Mobile / Phone

On phone-class viewports the Sessions Part is replaced by `MobileSessionsPart` (chosen at construction time by `SessionsPartService`). It enforces a single visible session — never a side-by-side layout — and otherwise reuses the same `SessionView` host.

### 4.4 Panelized Layout (Docked Input)

Each session view is a **rounded card** with a gap between neighbouring cards (and to the part edges), and the chat input is **broken out into its own card** docked at the bottom of the part. This is the standard layout for **every** created session — single or side-by-side — so the experience is consistent and optimized for parallel work. The only exception is the **new-session page** (workspace picker + composer), which keeps its own inline input.

- **Cards + gaps.** The gap is created in `SessionView.layout` by insetting the element within its grid leaf (`SessionView.CARD_GAP`, subtracted from the leaf size and applied as a margin — CSS margin alone would overflow because `size()` sets explicit pixel dimensions). Each `.session-view` gets the card shape (border-radius, `overflow: hidden`) in [media/sessionView.css](src/vs/sessions/browser/parts/media/sessionView.css). The Sessions Part itself is **transparent** (`SessionsPart.updateStyles` paints no part background; `.part.sessionspart` background is `transparent` in [browser/media/style.css](src/vs/sessions/browser/media/style.css)) so the gaps reveal the shell / macOS frost behind it; the grid's own separator line is suppressed (`SessionsPart._gridSeparatorBorder` returns transparent outside high-contrast) so the gap reads as empty space rather than a divider.
- **Transcript-only columns.** Every created-chat column renders its `ChatWidget` **transcript-only** (`IChatWidgetViewOptions.renderInput: false`). `SessionsPart.updateVisibleSessions` always passes `sharedInputMode: true` through `SessionView.openSession` (via `ISessionViewOptions.sharedInputMode`), which recreates the column's chat view when the mode flips. New-session slots are an **exception** — they always keep their own inline input, so the docked input hides while one of them is active.
- **The docked input card.** `SessionsPart` owns a single `ISharedChatInput` (`SharedChatInputView`, an **input-only** `ChatWidget` via `renderTranscript: false`) created lazily via `IChatViewFactory.createSharedInput()` and hosted in a `.sessions-shared-input-dock` (see [media/sessionsPart.css](src/vs/sessions/browser/parts/media/sessionsPart.css)). The dock is a **transparent, centered** in-flow flex child of the content area: the content area is a flex column (`.content { display: flex; flex-direction: column }`), the grid takes `flex: 1 1 auto; min-height: 0`, and the dock takes `flex: 0 0 auto`. This physically constrains the grid element to the space above the dock, so the grid's full-height column separator (sash) can never bleed down through the input. `SessionsPart._layoutContentAndDock` lays out the hosted input, measures the dock, and feeds the grid the remaining inner height. The hosted input spans the full editor width, inset by `SessionsPart.SHARED_INPUT_PADDING_H` so its left/right edges line up with the session cards above it (the 950px reading-width cap that applies to in-panel chat is dropped for the input-only dock — see `max-width: none` in [contrib/chat/browser/media/sharedChatInput.css](src/vs/sessions/contrib/chat/browser/media/sharedChatInput.css) and the `renderTranscript` gate in `ChatWidget.layout`). The input container paints its own solid rounded background (`.shared-chat-input-view .chat-input-container` in the same file) so it reads as its own floating card over the (possibly frosted) shell. It is bound to the active session's active chat via an autorun in `SessionsPart._updateSharedInput`, shown only when the active session is a created chat.
- **Active vs inactive cue.** In the side-by-side layout the active card gets a quiet persistent border (`.session-view.multi-session.is-active`, a translucent `focusBorder`) so it stays identifiable when idle; a lone card is trivially active and gets no border. The `is-active` / `multi-session` classes are toggled in `SessionsPart.updateVisibleSessions`.
- **In-progress "comet".** While a session is working (`SessionStatus.InProgress`), a looping comet travels around the **whole card border** (`.session-view.working` pseudo-elements in [media/sessionView.css](src/vs/sessions/browser/parts/media/sessionView.css)) — **blue** (`focusBorder`) when the card is the active session, **black** when it is an inactive side-by-side session. The colour is set by overriding `--chat-input-working-border-color1` per state; the animation reuses the global `chat-input-working-border-spin` keyframes and `--chat-input-anim-angle`. The docked input deliberately does **not** show a working comet (its `.chat-input-container.working` pseudo-elements are hidden in [sharedChatInput.css](src/vs/sessions/contrib/chat/browser/media/sharedChatInput.css)) — progress lives on the panel, not the input.
- **Keyboard switching cue.** `Cmd/Ctrl+1..9` (`sessions.focusSessionInGrid{n}`) focuses the session in that grid slot, switching the active session — and `SessionsPart.focusSession` moves keyboard focus straight into the docked input, so the user can keep typing. To make this discoverable, each card's header shows that shortcut as a small native keybinding pill (`SessionHeader.setShortcutHint`, styled with the `keybindingLabel` tokens) only in the multi-session layout. `SessionsPart` resolves the label via `IKeybindingService.lookupKeybinding` and pushes it through `SessionView.setShortcutHint`.
- **Accessibility.** The dock is a `role="region"` whose accessible name names the bound session (`localize('sharedInput.regionFor', "Chat input for {0}", name)`), and switching the active session announces the retarget to screen readers via `aria` `status()` (`"Chat input now sends to {0}"`). The shortcut pills are `aria-hidden` (the commands are already in the keybindings/command palette).
- **Per-session input state.** Draft text, attachments, selected model, mode, and permission live on each session's chat model, so retargeting the single input through `ChatWidget.setModel` (which flushes the outgoing draft and restores the incoming one) naturally swaps each session's input state in and out as the active session changes — no separate persistence is needed.
- **Both react to one model.** A created chat is shown by its card's transcript-only widget and the input-only docked widget at the same time; both observe the same `IChatModel`, so submitting from the docked input appears in the active card's transcript.
- **Focus.** `SessionsPart.focusSession` moves keyboard focus into the docked input (not the transcript-only card) when that card is the active created chat.
- **Confirmations / "agent needs input".** These render **inline in each session's transcript** (the chat list's fallback when there is no inline input), rather than docked above the input.


---

## 5. Editor Modal

Editors open as modal overlays rather than occupying grid space. The configuration `workbench.editor.useModal: 'all'` redirects all editor opens (without an explicit preferred group) to `ModalEditorPart`.

| Trigger | Behavior |
|---------|----------|
| Editor opens (no explicit group) | Opens in modal overlay |
| All editors closed / Escape / backdrop click | Modal closes and is disposed |

When the editor part is shown in the grid (not as a modal), its title toolbar (`MenuId.EditorTitleLayout`, right of the tabs) hosts layout actions registered in `contrib/editor/browser/editor.contribution.ts`, ordered left-to-right as: open in modal editor, **maximize / restore editor area**, a **chevron** toggle for the auxiliary bar, and **close editor area**. The auxiliary-bar chevron sits to the right of maximize/restore because it changes the right-hand side of the layout. When the auxiliary bar (secondary side bar) is visible a `chevron-right` **Push Editor Right** hides it; once hidden the same slot shows a `chevron-left` **Show Secondary Side Bar** that brings it back. `AuxiliaryBarVisibleContext` drives the flip.

When the auxiliary bar is hidden the editor becomes the rightmost card and expands into the freed space; the workbench's 10px right gutter still applies, and a `.noauxiliarybar` rule in `browser/media/style.css` restores the editor's right border and right corner radii so it keeps its card appearance.

The chevron toggle collapses or restores the secondary side bar while the editor stays open. When a session's editor working set is restored on session switch, the editor part is revealed programmatically and the session's saved auxiliary bar visibility is honored (a side bar the user hid for a session stays hidden when returning to it).

The main editor part can be explicitly revealed for workflows that target it directly.

### Single-pane redesign (experimental — `sessions.layout.singlePaneDetailPanel`, default OFF)

> See [SINGLE_PANE_SCENARIOS.md](SINGLE_PANE_SCENARIOS.md) for the full scenario/state/transition catalog and the manual validation checklist.

The entire third-pane redesign is gated behind the experimental setting `sessions.layout.singlePaneDetailPanel`, read **once at startup** (a window reload applies a change). When the setting is **off** (default) the Agents window renders exactly as documented above (auxiliary bar as its own grid column with its composite tab strip + title, the standard multi-diff Changes editor). When **on**, the third pane becomes a **single pane with one full-width tab bar**:

- The auxiliary bar is removed from the workbench grid and **docked inside the editor part** (absolutely positioned on the right, below the editor tab strip); the grid's top-right row becomes `Sessions | Editor`, and the editor part spans the editor + detail-panel width.
- The editor group's **title/tab strip spans the full width** while its content is inset on the right by the detail-panel width, via the concrete `EditorPart.setContentRightInset(px)` method (`EditorPart`/`EditorGroupView`; not on the `IEditorPart` interface; `0` = no-op for all other layouts).
- A **full-width header** sits below the tab bar, spanning the editor content and the docked detail panel, and hosts contributed actions. **The header menus are a group-level configuration; opting in is per-editor.** An editor part configures its groups with optional menu ids via `IEditorGroupViewOptions.menuIds` (`{ headerPrimary, headerSecondary, editorActions, tabsBarContext }`) — the core `EditorGroupView` never references any concrete menu point, it just renders whatever menu ids it was constructed with. `EditorPart.getGroupViewOptions()` is a protected hook (default `undefined`) that supplies these options to every group the part creates; `SinglePaneMainEditorPart` overrides it to return `Menus.SessionsEditorHeaderPrimary` / `Menus.SessionsEditorHeaderSecondary` / `Menus.SessionsEditorTitle` / `Menus.SessionsEditorTabsBarContext` (all defined in the sessions layer's shared menu registry, `browser/menus.ts`, not in core `platform/actions`). A header only renders while the **active editor opts in** via `IEditorPane.getHeaderActions()`, which returns just `{ instantiationService }` (the editor-scoped instantiation service so the header actions' `when` clauses evaluate in the editor's context) or `undefined` for no header; `EditorGroupView._renderEditorHeader` (run on every active-editor change) renders the group's configured menus as leading/trailing `MenuWorkbenchToolBar`s (`.editor-group-header-primary` / `.editor-group-header-secondary`, wrap-reversed so trailing actions float up) using that scoped service, hiding the whole header while both menus are empty. The header is a **real flow row inside the editor group** — `EditorGroupView` renders an optional `.editor-group-header` between its `.title` (tabs) and `.editor-container`, and **owns the header rendering and sizing**: the internal `setHeaderContent(render)` creates the inner content element, runs the render callback, and keeps the row **auto-sized to the content** via a `ResizeObserver` (wrapping and growing as needed, firing `onDidChangeHeaderHeight`); `headerHeight` exposes the reserved height. The group lays it out in flow (no absolute positioning) and shifts the editor pane down by its height. `SinglePaneMainEditorPart` renders no header DOM; it only offsets the docked auxiliary bar + sash down by `group.headerHeight` (`IDockedAuxiliaryBarHost.getHeaderHeight()`, re-applied on `onDidChangeHeaderHeight` via `_registerGroupHeader()`). The **Changes editor** (`SessionChangesEditor`) implements `getHeaderActions()` in single-pane (returning its scoped instantiation service), so the group renders `Menus.SessionsEditorHeaderPrimary` (to the left, `navigation` group: the *Branch Changes* dropdown, then the diff-stats action — the same clickable "+X -Y" pill (`VIEW_SESSION_CHANGES_COMMAND_ID`, rendered by `ChangesDiffStatsActionItem`) used by the classic Changes view header, always shown regardless of whether the editor area is visible or collapsed and opening/re-opening the Changes editor on click — then a separate `1_codeReview` group (separator before it) with *Run Code Review*, shown only when `SessionHasChangesContext` is true) and `Menus.SessionsEditorHeaderSecondary` (to the right, all inline unless overflowed: a `1_diff` group with collapse/expand + *Show Side by Side Diff* / *Show Inline Diff* (mutually exclusive by render mode); the sentinel `secondary` group — *View as List/Tree* — falls into the toolbar's overflow "…" menu) for the Changes tab only. The **Create Pull Request** button bar (`ChangesActionsBar`) is hosted in the editor tabs title: a header anchor action (`CHANGES_HEADER_ACTIONS_ID`, registered in `changesViewActions.ts`, contributed to `Menus.SessionsEditorTitle` group `navigation` order 5 and gated on the active Changes editor, top-right editor group, main window, dock-detail-panel setting, and `SessionHasChangesContext`) is rendered by the editor group's title actions. Its custom view item is supplied by `SessionChangesEditor.getActionViewItem()` as `ChangesActionsBarActionViewItem`, and the CSS makes the editor-actions side shrink to 50px before the tab scroller shrinks; split-button labels ellipsize while the dropdown segment stays visible. It hides entirely when its `AgentsChangesToolbar` menu has no actions. (In the classic non-single-pane layout the same `ChangesActionsBar` is still rendered inside `SessionChangesEditor`'s internal header.) The header-primary custom action view items (picker, diff-stats pill) are registered globally by `(menuId, actionId)` via `IActionViewItemService` in `ChangesEditorHeaderContribution` (`contrib/changes/browser/changesView.ts`), so the group's generic menu toolbars resolve them. The same *Branch Changes* picker and diff-stats actions are also contributed to the classic aux-bar Changes view menus (`ChatEditingSessionChangesFileHeaderToolbar` / `…RightToolbar`), which that view renders with its own action view items — so the two surfaces stay independent.
- A vertical **sash** on the left edge of the docked panel resizes it (`DockedAuxiliaryBarController` in `browser/dockedAuxiliaryBarController.ts` owns `layout()` / `_ensureSash()`, created/driven by `SinglePaneMainEditorPart`). The preferred first-open width is 300px; explicit user resizes persist via the part-sizes snapshot. While the panel is visible it clamps to `[220px, editorWidth - 300px]`; dragging the raw sash width down to ~0 hides the docked detail panel, leaving the editor content visible. Temporary width growth from collapsing the sessions list is restored before persistence and must not become the user's detail width.
- Collapsing the sessions list transfers the freed sidebar width to the editor grid node when the editor content is **visible**, and to the **detail panel** (`_dockedAuxiliaryBarWidth`, with the editor node kept equal to it) when the editor content is **hidden** (detail-only). Reopening the sessions list restores the pre-collapse editor-node width / detail width. Keeping the hidden-editor node equal to the detail width ensures the width-based reveal-sync never mistakes a wide detail-only node for a revealed editor.
- When the editor part is hidden while the docked detail panel remains visible, the editor grid node stays visible for the shared tab strip but shrinks to the persisted detail-panel width, letting the Sessions part absorb the freed editor-content space. The detail panel fills that narrowed node below the tab strip and the editor content area collapses to zero. Its sash remains available so dragging the raw requested detail width below its 220px minimum hides the detail panel; the clamped visible width must not decide this. When a visible editor and its details no longer fit within the node, resize handling hides the details first and leaves editor content visible.
- Widening a detail-only editor node does not automatically reveal editor content. The editor area remains hidden until the user explicitly opens an editor workflow or toggles the editor area. This preserves the user's detail-only choice across sash drags and grid relayouts.
- When the outer editor sash makes a visible editor and its docked details too narrow to coexist, single-pane automatically hides details and leaves editor content visible. If the user widens the node past the detail width plus the editor minimum and a 100px hysteresis margin, it restores the details. This responsive detail behavior is exclusive to the single-pane layout.
- Revealing the side pane from *closed* (`setEditorHidden(false)`, e.g. the session-header Changes button opening the Changes editor) gives the editor a comfortable width via the single-pane `_applyEditorSplitSize()` override (`max(300, floor(windowWidth * 0.6))`, i.e. **60% of the full window width** — the shared ratio `SIDE_PANE_WIDTH_RATIO` in `parts/editorPartSizing.ts`; the base grid layout instead does a plain even split of the main area). In docked mode this runs on **every** reveal that has no `_dockedEditorSizeBeforeHide` to restore — not just the first per window — because hiding collapses the editor node to the detail width and the grid caches it, so a later reveal (including in another session, where the per-window `_hasAppliedInitialEditorSplit` flag is already set) would otherwise restore the narrow cached width. A genuinely user-chosen width captured on hide (`_dockedEditorSizeBeforeHide`) takes precedence and is restored as-is. Non-docked layout keeps the original first-reveal-only gating via `_hasAppliedInitialEditorSplit`.
- Side-pane sizes are **workbench-level, not per session**: the editor grid node width is owned by the workbench grid and persisted globally (`workbench.sessions.partSizes`), so switching between sessions keeps the same side-pane width the user last set — the layout controller does not track or restore a per-session width. The workbench persists the docked side-pane geometry across reloads via `_savePartSizes` on `onWillSaveState`, restored by `createDesktopGridDescriptor`. Because the docked detail (auxiliary bar) lives **inside** the editor grid node, the persisted editor value is the pure editor-content width: `_persistedEditorWidth` subtracts the docked detail width **only when the detail is visible**, mirroring the descriptor, which adds it back only when the detail is visible. Subtracting it unconditionally (the earlier bug) shrank an **Editor-only** session's side pane by the detail width on every reload, compounding toward zero.
- `_dockedEditorSizeBeforeHide` is captured on hide **only for "Hide Editor"** (detail/auxiliary bar still visible, so the editor node stays visible at a real user-chosen width). When the **whole** side pane closes (auxiliary bar also hidden — e.g. **Toggle Side Panel** or the last-tab close, where `setEditorHidden(true)` runs with `partVisibility.auxiliaryBar === false`), the editor grid node collapses to `0px`, so capturing it would restore a bogus/cramped width; instead `_dockedEditorSizeBeforeHide` is cleared and the stale sidebar-collapse grow snapshots (`_editorSizeGrownForSidebarHide` / `_detailWidthGrownForSidebarHide`) are dropped, so reopening falls through to the 60%-of-window split. Because the split is computed from the full window width (not the remaining main area), reopening the side pane is a generous width rather than the cramped node a captured `0px` (or a stale pre-collapse snapshot) would restore.
- The shared editor title's inline layout cluster orders the Hide Editor chevron before maximize/restore, followed by the detail-panel toggle. The detail-panel toggle is conditional (shown only when the active tab is Changes or Files, i.e. hidden for Browser/Search tabs, which have no detail). No chevron is shown while the editor is hidden; opening a file or diff from the detail panel reveals the editor again. If the detail-panel toggle hides the detail while editor content is hidden, it reveals the editor content instead of leaving the pane empty; **Toggle Side Panel** remains the separate action that can hide both.
- Changes opens as a **custom `SessionChangesEditor`** (the multi-diff editor; in single-pane its *Branch Changes* dropdown + diff-stats + primary actions render in the full-width header part above, so the editor itself is header-less and the diff fills the pane). Each file header shows the live `+insertions -deletions` counts from the selected changeset alongside the file label. Clicking a Branch Changes file honors the same `sessions.changes.openSingleFileDiff` setting and Alt inversion as the standard layout, opening either a docked single-file diff or revealing the file in this multi-diff editor. The auxiliary bar's composite tab strip + title are hidden, and `SinglePaneDetailPanelStrategy` maps the active editor tab to the detail container (Changes → files + Checks, File → Explorer, Browser → hidden). Created sessions default to **editor-only** (the Changes/file editor visible, the detail closed); activating a Changes/file editor switches the detail container to match but does **not** force-reveal a hidden detail — except when the empty Files placeholder becomes active (which reveals the Files detail) or when the detail was transiently hidden by a Browser tab (switching back to File or Changes re-reveals it).
- Closing the last editor tab hides both the editor content and the docked detail panel, leaving the Agents window chat-only. Opening any tab reveals the editor part again, and `DetailPanelController` restores the matching detail content for File/Changes tabs.
- **Editor-area tab collapse:** when the editor area is hidden (detail-only), the single-pane controller closes **every non-docked** editor tab (anything not `instanceof DockedEditorInput`) so only the docked Changes and Files tabs remain, capturing each closable one's untyped input **and tab index** (`editor.toUntyped()`); when the editor area is shown again the captured ones are reopened **at their original positions** (`SinglePaneEditorAreaCollapseStrategy._collapseNonManagedTabs` / `_restoreCollapsedTabs`, registered by `SinglePaneLayoutController._registerAuxiliaryControllers`). It is serialized on the shared docked-tab `Sequencer`, skipped during a layout-driven restore (`ISinglePaneLayoutContext.isRestoringSessionLayout`), and the capture is dropped on a session change. Non-restorable tabs (e.g. an **untitled Search editor**, whose `toUntyped()` returns `undefined`) are still closed but not restored; dirty editors are closed too (the workbench save/confirm flow applies), so they don't linger in a "closed" editor area.
- While a new (uncreated) workspace session view is active, the editor content is kept hidden **continuously** so the Files detail panel and editor tab bar remain visible without showing editor content by default. The rule is **level-triggered** on the active editor + editor-part visibility (in `singlePaneLayoutController.ts`): it hides the editor whenever the active editor is **not real content** (a `FileEditorInput` for a real file or a `BrowserEditorInput`), treating the managed empty landing tab (`EmptyFileEditorInput`) and "no active editor" as not real content. Because it re-reads visibility + active editor, any spurious reveal (a session-switch working-set restore, a layout race, the 60%-of-window split) is **re-hidden** — so reopening a new session after visiting a created session keeps the editor closed. While there is no real content the width-based reveal-sync is also suppressed (`setSuppressDockedEditorRevealSync(true)`), so sidebar-collapse, grid relayout, and grid-sash drags never re-reveal the editor there. Once a real file/diff is the active editor the hide **short-circuits** (and the suppress flag clears), so a real open (via `onWillOpenEditor` → `setEditorHidden(false)`) or the detail-panel toggle reveals it and sticks. On submit, a Changes tab is added and the Changes detail is shown, but the editor content stays closed. The auto-managed Changes and File tabs never reveal the editor content.
- CSS is scoped by a `.dock-detail-panel` class on the workbench container; `:not(.dock-detail-panel)` reproduces the original grid-based styling.
- The docked auxiliary bar draws its own left and top borders with `--vscode-agentsPanel-border` so the detail panel reads as a bordered region connected to the middle divider.

---

## 6. Feature Support

| Feature | Supported | Notes |
|---------|-----------|-------|
| Sidebar / Aux Bar / Panel toggle | ✅ | Fixed positions (sidebar: left, panel: bottom) |
| Maximize Panel | ✅ | Excludes titlebar |
| Resize Parts | ✅ | Via grid sash or programmatic API |
| Zen Mode / Centered Layout / Menu Bar Toggle | ❌ No-op | — |
| Maximize Auxiliary Bar | ❌ No-op | — |

---

## 7. Parts Architecture

The Sidebar, Auxiliary Bar, and Panel extend `AbstractPaneCompositePart`; the Titlebar extends `Part` directly; the Sessions Part also extends `Part` (it is not a pane composite — it owns its own internal grid of session views, see [§4](#4-sessions-part)). All parts are instantiated eagerly so they register themselves with the workbench layout service before `createWorkbenchLayout()` builds the grid. The pane-composite parts are accessed through `AgenticPaneCompositePartService`, which replaces the standard `IPaneCompositePartService`.

Key differences from standard workbench parts:
- **No activity bar** — account widget lives in the sidebar footer
- **Fixed composite bar** — for pane-composite parts the position is always `Title`; the sidebar hides its composite bar (only the sessions list shows)
- **Card appearance** — each session view and the docked input render as rounded cards with gaps; the Sessions Part itself is transparent so the gaps reveal the shell/frost. The Auxiliary Bar and Panel also render as cards with rounded borders and margins; the Sidebar is flush
- **Separate storage keys** — each part uses `workbench.agentsession.*` keys to avoid conflicts with regular workbench state
- **Sidebar footer** — a two-toolbar row below the sessions list: the account widget (avatar + handle) fills the left, and the primary action icons (New Session, Customizations, collapse/expand rail) are borderless and right-aligned, inline with the account widget. In the collapsed rail the footer stacks as a centered column (`column-reverse`) with the action icons above the avatar, bottom-anchored. The actions are registered to `Menus.SidebarFooterActions` and hidden on phone (`IsPhoneLayoutContext.negate()`), where they live on the mobile top bar instead.
- **macOS traffic lights** — sidebar includes a spacer (70px) for window controls when using custom titlebar

---

## 8. Contributions

Contributions are registered via module imports in entry points (`sessions.common.main.ts`, `sessions.desktop.main.ts`).

Key UI surfaces:
- **Sessions View** — sidebar, shows sessions grouped by workspace with pinned section
- **Changes View** — auxiliary bar, shows file changes for the active session
- **Chat / New Chat views** — hosted inside each `SessionView` in the Sessions Part, registered via `IChatViewFactory` from `contrib/chat/`

All session-window contributions use `WindowVisibility.Sessions` to only appear in the Agents Window.

---

## 9. Lifecycle

1. `constructor()` → `startup()` → `initServices()` → `initLayout()`
2. `renderWorkbench()` — creates DOM and parts (editor part created hidden)
3. `createWorkbenchLayout()` — builds the workbench grid
4. `createWorkbenchManagement()` — eagerly creates the welcome/setup service. Wiring of the Sessions Part lives in `SessionsService` (an eager singleton): it owns the single reconcile autorun that reads `ISessionsService.visibleSessions` and calls `SessionsPartService.updateVisibleSessions(...)`, and it observes its own `activeSession` (the active visible slot) to move keyboard focus into that session's view via `SessionsPartService.focusSession` (guarded so it does not steal focus from a session the user is already interacting with). The part itself is a passive renderer; focus is a pure view concern — the management service never reaches into the part.
5. `layout()` → `restore()` — opens default view containers for visible parts

**Initial part visibility:** Sidebar ✅, Sessions Part ✅, Auxiliary Bar ✅, Editor ❌, Panel ❌. The editor pane comprises the editor and auxiliary-bar parts; the workbench adds `noeditorpane` only when both are hidden. In the single-pane layout, it instead reads the docked editor grid node's visibility, which is also visible for a detail-only pane.

---

## 10. Per-Session Layout State

`LayoutController` (`contrib/layout/browser/sessionLayoutController.ts`) manages layout state as the user switches between sessions. All state is persisted to workspace storage so it survives restarts. This section is a summary — see **[LAYOUT_CONTROLLER.md](LAYOUT_CONTROLLER.md)** for the full specification (switch trigger, multi-session handling, auto-reveal, persistence, and invariants).

### Auxiliary Bar

Each session independently remembers whether the auxiliary bar is visible and which view container is active. When switching to a session, the saved state is restored. When switching away, the current state is captured.

**Auto-reveal on changes:** When a chat turn completes and new file changes appeared (changes count was zero when the turn was submitted, non-zero when it ends), the auxiliary bar is automatically revealed to show the Changes view. This lets the user see what the agent modified without manual intervention. On mobile the auto-reveal is suppressed to avoid disruptive layout shifts.

**Default view on new sessions:** An untitled session always opens the Files view. A session with a workspace but no changes defaults to the Files view; once changes exist it defaults to the Changes view.

### Panel

The panel (terminal / debug output) is hidden by default for all sessions. Each session independently tracks the user's last explicit show/hide action, and that state is restored on session switch.

### Editor Working Sets

Each session remembers which editors were open, regardless of `workbench.editor.useModal`: browser editors dock in the shared grid editor part even when other editors are forced modal (`useModal: 'all'`), so their tabs still need per-session tracking. On session switch the previous session's open editors are saved as a named working set and the incoming session's working set is restored. Archived or deleted sessions have their working sets removed.

This is coordinated carefully: the active session observable is updated before the workspace folders update, so `LayoutController` waits until the workspace folders reflect the new session before applying the working set (to avoid restoring editors into the wrong workspace).

---

## 11. CSS

The workbench root element has class `agent-sessions-workbench`. Visibility classes (`nosidebar`, `noauxiliarybar`, `nosessionspart`, `nopanel`) are toggled on the main container.

The shell background uses an accent-tinted radial gradient derived from `button.background`, with titlebar and sidebar wrappers transparent so the gradient reads continuously. High-contrast themes disable the gradient.
