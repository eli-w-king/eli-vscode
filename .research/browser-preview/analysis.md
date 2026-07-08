# Browser Preview A/B UserTesting Analysis

**Scope/caveat:** 10 total participants (5 per variant), all professional engineers who code daily and use AI tools. Findings are quote-grounded but directional; sample size is too small for statistical conclusions, and several transcripts include speech-to-text artifacts.

## 1. Per-variant themes

### Variant A — “decoupled”

1. **Keeping agent chat beside the preview supported iterative UI refinement.** `[satisfaction]`  
   **Participants:** P81, P159  
   - P81: “What feels most useful about this layout is uh, is the side by side view. I can see the agent's chart, uh, on the left and the life preview on the right.”  
   - P159: “it's useful that it opens up in the side and still lets me see my agentic prompts on the left.”

2. **The focused/preview view made file changes harder to verify.** `[painpoint]`  
   **Participants:** P81, P159  
   - P81: “What feel missing is the file changes changes pan. I can't see Ds or know which file were modified without switching tabs.”  
   - P159: “I can't see any of the files that have been changed so far. So I can't tell if the agentic tools are modifying files that it shouldn't be.”

3. **Users wanted preview + diff/code in one workspace, not repeated tab switching.** `[need]`  
   **Participants:** P81, P66, P58  
   - P81: “a split view with the D panel docks on the right would make this workflow much faster and reduce contents switching.”  
   - P66: “That will save a lot of time when working on a, uh, when working, when working on the project website project.”

4. **Server/startup state and prototype content created confusion about whether something was broken.** `[confusion]`  
   **Participants:** P58, P66, P104  
   - P104: “I'm not clear why it's like restarting the server and all this stuff, like did it go wrong?”  
   - P58: “It, it looks like whoever's doing this is having issues.”

5. **Participants used or expected a “Changes/Branch changes” entry point for related files.** `[satisfaction]`  
   **Participants:** P58, P66, P159  
   - P58: “Branch changes right here where it says branch change changes, that's where I would go.”  
   - P159: “I think I would expect the file changes to show just below the preview.”

6. **Some wanted broader workspace/session/team context preserved, especially in the more focused view.** `[opportunity]`  
   **Participants:** P104, P159, P58  
   - P104: “it's harder to see kind of the GitHub repos files and different agents and things like that.”  
   - P58: “I like when the team is somewhere on the page or it's a team collaboration.”

7. **Advanced browser-preview capabilities would make the preview feel more production-ready.** `[opportunity]`  
   **Participants:** P159, P81  
   - P159: “the ability to add web extensions, um, would make it a little bit more useful.”  
   - P81: “One thing I expected this prototype to support is inline com Commenting directly on the preview.”

### Variant B — “preview”

1. **Embedded, same-workspace preview matched several participants’ expectations.** `[satisfaction]`  
   **Participants:** P35, P84, P118  
   - P35: “I would just expect that the browser preview would open like a separate like embedded preview panel, like within the same workspace rather than like taking me away from the main interface.”  
   - P84: “the screen is normal.”

2. **The preview needed more space or layout controls.** `[painpoint]`  
   **Participants:** P14, P35  
   - P14: “preview should not be going in that small section.”  
   - P35: “I didn't expect for it to be here. I thought it would take up more of, of this screen.”

3. **Seeing file changes beside the preview was important for debugging visual regressions.** `[need]`  
   **Participants:** P35, P80, P84, P118  
   - P80: “the period tell me what result is why the file change. Help me understand what caused it.”  
   - P35: “it's a little harder to connect code changes to their, you know, the visual aspect.”

4. **The “Changes” tab/section was a discoverable path to inspect modified files.** `[satisfaction]`  
   **Participants:** P14, P35, P80  
   - P14: “I can click on this changes section so that I can see the related file changes.”  
   - P80: “I see a tab on the top right next of next to files, so I would click that tab To inspect the related file changes.”

5. **Users wanted a direct bridge from visual element to source file/component/line.** `[opportunity]`  
   **Participants:** P80, P84, P118  
   - P80: “I could directly click on the element in the preview immediately see the exact file components or line code respond for it.”  
   - P84: “I would like to see some code, even if it's not all another, so the change in it.”

6. **The agent chat remained the control point for continued iteration, but could become too hidden in focused views.** `[need]`  
   **Participants:** P35, P80  
   - P35: “the current agent convo are like usually most important kind of followed by like understanding what's changed.”  
   - P80: “immediately ask the agent to adjust that specific part rather than restarting the whole process.”

7. **Some participants expected preview behavior such as popup/fullscreen/auto-refresh, indicating unclear interaction model.** `[confusion]`  
   **Participants:** P14, P35, P118  
   - P14: “It'll create a popup. It'll open a pop-up and it'll show how the preview looks like.”  
   - P35: “I wouldn't expect like a full page redirect, just like a split screen live preview.”

## 2. A vs. B comparison

- **Both variants supported the same core workflow expectation:** preview should remain close to the active agent/chat and relevant code context. Participants rarely argued for a completely separate browser; they wanted same-workspace review with enough surrounding context.
- **Variant B felt slightly clearer as an embedded preview concept.** P35 explicitly expected an embedded panel, and P84 described the screen as normal. However, B also produced placement/size complaints: P14 wanted fullscreen/less-small preview, and P35 expected it farther right/larger.
- **Variant A produced more confusion around state and surrounding UI.** Several A participants interpreted server restart/status content as errors or process failure rather than preview state.
- **Focused views were risky in both variants.** When preview focus hid changed files or broader repo/session context, participants felt less able to verify agent work.
- **Decoupled vs. embedded placement signal:** Embedded/split preview generally aligned better with participants’ desire to keep chat, files, and changes visible. The “decoupled” direction did not produce a strong preference for separation; the strongest desires were resize, split, diff, and source-linking.
- **Caveat:** With 5 participants per condition and noisy transcripts, treat this as directional evidence, not a winner-take-all A/B result.

## 3. Q6 ranking synthesis

Aggregate ranking across all 10 participants by average rank:

| Area | Avg. rank | Top-1 count | Top-2 count | Synthesis |
|---|---:|---:|---:|---|
| List of file changes in this branch | 2.1 | 2 | 9 | Strongest consensus: almost everyone placed it in top 2. |
| List of files in this workspace | 2.4 | 3 | 4 | Consistently useful, never ranked last. |
| Active session’s chat | 2.7 | 4 | 5 | Polarized but important: most top-1 votes, but a few ranked it low. |
| List of all sessions | 3.9 | 1 | 2 | Lower priority; useful mainly for broader context. |
| Terminal | 4.0 | 0 | 0 | Middle/low priority during visual review. |
| Other | 5.9 | 0 | 0 | Almost always least useful. |

**Consensus order:** file changes ≈ workspace files ≈ active chat are the critical visible areas; terminal and all sessions are secondary; other is least useful. File changes had the clearest consensus.

## 4. Top 5 cross-study findings, ranked by strength

### 1. Users need to verify visual output against the agent’s file changes/diff in the same flow.

**Strength:** Very strong; Q6 top-2 for file changes in 9/10 participants, plus explicit Q8/Q11 comments from both variants. `[need/painpoint]`  
**Evidence:** P81, P159, P35, P80, P84, P118, P66  
- P159: “I can't see any of the files that have been changed so far. So I can't tell if the agentic tools are modifying files that it shouldn't be.”  
- P80: “the period tell me what result is why the file change. Help me understand what caused it.”  
**Design implication:** Build a persistent, dockable changed-files/diff panel that can stay visible with the preview, ideally synchronized to the current agent task.

### 2. The active agent chat should remain visible because it is the command/control loop for refining the UI.

**Strength:** Strong; active chat had the most first-place votes and repeated qualitative support. `[need/satisfaction]`  
**Evidence:** P81, P159, P35, P80  
- P81: “I can see the agent's chart, uh, on the left and the life preview on the right.”  
- P80: “immediately ask the agent to adjust that specific part rather than restarting the whole process.”  
**Design implication:** Do not let preview mode fully replace or obscure the active session chat. Prefer resizable split layouts that keep chat reachable.

### 3. Participants want a direct connection from preview elements to source files, components, and diffs.

**Strength:** Strong; explicit from multiple B participants and implied by A requests for side-by-side diff/change history. `[opportunity]`  
**Evidence:** P80, P84, P81, P58  
- P80: “directly click on the element in the preview immediately see the exact file components or line code respond for it.”  
- P58: “Branch changes right here where it says branch change changes, that's where I would go.”  
**Design implication:** Add “Inspect Element → Reveal Changed File/Diff” affordances, changed-file highlighting, and a clear path from visual output to code owner.

### 4. Preview placement should be embedded/split and resizable, not a small fixed area or disconnected context.

**Strength:** Moderate-strong; across both variants, users valued side-by-side context but complained when preview was too small or not where expected. `[painpoint/opportunity]`  
**Evidence:** P14, P35, P81, P159  
- P14: “preview should not be going in that small section.”  
- P35: “I wouldn't expect like a full page redirect, just like a split screen live preview.”  
**Design implication:** Provide layout controls: resize, collapse side panels, open larger, fullscreen/pop-out, and restore previous split.

### 5. Preview status/loading/errors need to be explicit so users do not misread prototype/server activity as failure.

**Strength:** Moderate; fewer participants, but high confusion severity when it occurred. `[confusion]`  
**Evidence:** P58, P104, P81, P14  
- P104: “I'm not clear why it's like restarting the server and all this stuff, like did it go wrong?”  
- P58: “It, it looks like whoever's doing this is having issues.”  
**Design implication:** Show clear preview lifecycle states: starting server, server ready, refreshing, failed, retrying, and whether updates are automatic or manual.

## 5. Single strongest signal for what to build/change next

**Build an embedded, resizable preview workspace that keeps the active agent chat and changed-files/diff panel visible at the same time, with direct preview-to-source linking.**

The clearest cross-study signal is not simply “show a browser preview”; it is **make previewing agent work auditable**. Engineers want to see the visual result, continue instructing the agent, and verify exactly what files changed without switching contexts.
