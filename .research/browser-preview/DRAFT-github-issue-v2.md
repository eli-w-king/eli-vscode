## Executive summary

We ran two moderated UserTesting studies on the Agents window browser preview, variant **A "decoupled"** and variant **B "preview"**, with 10 professional engineers (5 per variant, all of whom code daily and use AI coding tools). One signal came through louder than anything else, and telemetry backs it up:

**When developers preview an agent's UI change, they want to check it against what the agent actually changed (the file diff) and keep instructing the agent, all in the same view.** Today the preview pushes the diff out of sight, so people tab away to see what happened and lose the thread.

The recommendation: when a browser preview is open in a session, keep the **Changes (diff)** panel and the **active agent chat** visible right next to it, and (as a fast follow) let people click an element in the preview to jump to the file that renders it. The demo above shows that layout running: chat on the left, the live preview in the middle, and the changed files on the right, all at once.

## What we heard

Quotes are verbatim from participants (P##). Telemetry is from VS Code Stable desktop; caveats are at the end.

### 1. Check the visual output against the file changes, together
Nine of ten participants put "list of file changes in this branch" in their top two things to keep visible while previewing. They kept losing track of what the agent had touched:

- P159: *"I can't see any of the files that have been changed so far. So I can't tell if the agentic tools are modifying files that it shouldn't be."*
- P81: *"What feels missing is the file changes panel. I can't see diffs or know which files were modified without switching tabs."*

The behavior shows up in telemetry too: about **7.6M** Stable-desktop users create side-by-side editor splits in a six-week window, and roughly **597k** open a file diff and **451k** open the Source Control changes view by command (keyboard or palette only, so a floor). People already work hard to see two things at once; the preview shouldn't take that away.

### 2. Keep the agent chat in view, it's the steering wheel
The active session chat drew the most first-place "keep this visible" votes. It's how people iterate:

- P80: *"immediately ask the agent to adjust that specific part rather than restarting the whole process."*
- P81: *"I can see the agent's chat on the left and the live preview on the right."*

Preview users and agent users are largely the same people: about **20%** of weekly preview users also send chat requests and **14%** run agent-mode sessions in the same week, and **6.4%** of preview sessions already contain a chat request.

### 3. Jump from a preview element to its source
Participants wanted to go from a pixel to the code behind it:

- P80: *"I could directly click on the element in the preview [and] immediately see the exact file, component, or line of code responsible for it."*
- P58: *"Branch changes right here, that's where I would go."*

This doesn't exist yet, so there's no telemetry for it, but `git.openChange` (about 597k users in six weeks) shows the adjacent appetite for jumping from a change to its code.

### 4. The preview should be embedded and resizable
Both variants liked side-by-side context but pushed back when the preview was too small or somewhere unexpected:

- P14: *"preview should not be going in that small section."*
- P35: *"I wouldn't expect a full page redirect, just a split-screen live preview."*

The native Simple Browser is barely used (about 165 daily users), while the Live Preview extension has roughly **541k** users and **239k** fresh installs in six weeks. There's clear demand for an embedded, in-editor preview that the built-in surface isn't meeting.

### 5. Make the preview's state legible
Several people read the prototype's server start and refresh activity as a failure:

- P104: *"I'm not clear why it's restarting the server and all this stuff, did it go wrong?"*
- P58: *"It looks like whoever's doing this is having issues."*

Cheap to fix with clear states: starting, ready, refreshing, failed, plus whether refresh is automatic.

## A vs B

At five participants per variant this is directional, not statistical, but the direction was consistent:

- **Embedded (B) matched expectations better.** People expected a split or embedded preview in the same workspace, not a separate surface. B drew fewer "where did it go / is it broken" reactions.
- **Decoupled (A) caused more confusion** about state and surroundings, and produced no real desire for separation. The strongest wishes in both were the same: see the diff, keep chat, resize, and link the preview to its source.
- **Decision:** go with the embedded, same-workspace preview, and spend the design effort on making it auditable (diff and chat visible, click to source) rather than on detaching the browser.

## Method and caveats

- **Studies:** "vscode Agents - Browser Preview A (decoupled)" and "B (preview)", five completed sessions each, think-out-loud, screen and audio. All participants screened as engineers who code daily and use AI tools.
- **Small sample:** 10 total, so findings are directional. Transcripts include speech-to-text artifacts.
- **Telemetry:** VS Code Stable desktop. Raw events are retained about 45 days, so adoption metrics use a 42-day window and heavy joins use 7 days. `workbenchactionexecuted` only fires for keyboard and palette actions, so the context-switch and diff-open counts are lower bounds (mouse clicks on tabs and files aren't instrumented). There's no telemetry for the prototype itself; the quantitative figures are adjacent shipping behavior.
