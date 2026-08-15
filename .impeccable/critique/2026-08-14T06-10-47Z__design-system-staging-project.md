---
target: design-system-staging/project
total_score: 13
max_score: 36
na_heuristics: 7
p0_count: 3
p1_count: 4
timestamp: 2026-08-14T06-10-47Z
slug: design-system-staging-project
---
## Design System Critique: design-system-staging/project

Method: DEGRADED single-context (no sub-agent tool available)

### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 1 | Toast only. No loading, skeleton, or async feedback |
| 2 | Match System / Real World | 2 | Card tone:'white' renders dark (#1a1a1a) — name/output mismatch |
| 3 | User Control and Freedom | 2 | Toast whole-component dismiss only. No explicit close |
| 4 | Consistency and Standards | 1 | variant names/prop names/color descriptions differ per component |
| 5 | Error Prevention | 1 | No Input validation. Card radius prop accepts arbitrary string bypassing tokens |
| 6 | Recognition Rather Than Recall | 2 | Deprecated tokens mixed with canonical. Must memorize which to use |
| 7 | Flexibility and Efficiency | n/a | DS consumer context — API consistency more relevant than runtime efficiency |
| 8 | Aesthetic and Minimalist Design | 2 | 8 tag colors + 4 rarity + 2 accent = color overload |
| 9 | Error Recovery | 1 | Input has no error state. Only Toast type=error exists |
| 10 | Help and Documentation | 1 | README mismatches actual code. References deleted files |
| Total | | 13/36 | Poor |

### Priority Issues

P0: --leading-bold-display:0.95 clips Korean descenders
P0: Button press feedback mouse-only — touch events absent (mobile-first system)
P0: No focus states on any component — WCAG 2.4.7 AA violation
P1: Card white/tint variants produce identical output — dead API
P1: Radius scale non-monotonic: md(12px) > card(10px)
P1: Deprecated tokens actively used by shipped components
P1: External CDN (unpkg) runtime dependency — no fallback, no version pin

### Minor Issues (summary)

- --color-secondary #8a5a2e on black = 2.9:1 contrast fail
- --color-text-secondary #9a9a9a on black = 3.7:1 contrast fail
- README spacing table doesn't match spacing.css tokens
- --tracking-* tokens declared but never applied in any component
- Button.d.ts variant names differ from JSDoc and implementation
- --weight-bold-lg token missing from bold display set
- --color-base-grey-200 and --color-base-amber unreferenced
- Inter-Variable not a real font name — fallback silently ignored
- README still claims elevation.css/3-level shadows (file deleted)
- ShapeTag dark prop vs Button surface='dark' — inconsistent naming
- ModalToast width:240 hardcoded — non-responsive
