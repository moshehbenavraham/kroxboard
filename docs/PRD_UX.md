# OpenClaw Dashboard - UX Requirements Document

**Companion to**: [PRD.md](PRD.md)
**Created**: 2026-03-30

---

## 1. Design Brief

### Emotional Targets
Assured control + quiet playfulness + operational trust

The operator must feel like they are in command of a complex system without effort. The pixel office injects warmth and personality into what would otherwise be a standard monitoring tool. Security hardening reinforces trust -- the dashboard communicates "nothing leaks, nothing fires without your say."

### Aesthetic Identity
- **Reference domain**: Mission control / aerospace instrumentation -- dense, information-rich panels designed for sustained attention
- **Era / movement**: Late-2010s dark-mode dashboards refined through pixel-art personality -- Grafana meets Tamagotchi
- **Material metaphor**: Matte brushed dark metal with backlit indicators and pixel-art decals -- the interface feels like a well-maintained instrument panel where every light means something

The pixel office is the intentional contrast: soft, animated, playful pixel art against the hard precision of the monitoring shell.

### Signature Moment
The pixel office isometric view -- tiny agents wandering, working, idling in a miniature office that mirrors real gateway activity. Operators check it the way someone checks a fish tank: brief, ambient, reassuring. The heatmap and idle-rank overlays transform this from decoration into genuine operational insight.

### Micro-Narrative
**Arrival** (sidebar + home): Immediate orientation -- gateway health, agent cards, active session counts. No login wall; the dashboard trusts its network boundary.
**Orientation** (nav groups): Three mental buckets -- Overview (agents, pixel office, models), Monitor (sessions, stats, alerts), Config (skills). The sidebar is always one click away from any view.
**Engagement** (drill-down): Tables, charts, overlays. The operator scans, filters, expands. Information density increases as they go deeper.
**Action** (mutating features): Gated behind env toggles. When enabled, action controls surface inline -- never hidden, never ambiguous about what they will do.
**Resolution** (return to home): The home page is the neutral resting state. Gateway status and agent cards confirm everything is nominal.

---

## 2. User Flows

### Flow 1: Read-Only Health Check
**Trigger**: Operator opens the dashboard
**Goal**: Confirm agents, gateway, and sessions are healthy

```
Home (/) --> Scan agent cards + gateway status --> Healthy? --> Done
                                                       |
                                                       v (unhealthy)
                                                  Sessions (/sessions) --> Filter by agent
                                                       |
                                                       v
                                                  Alerts (/alerts) --> Review active rules
```

**Happy path**: Home shows green status across all agent cards, gateway badge shows connected, recent session count is non-zero.
**Error states**: Gateway unreachable (red badge, retry affordance). Agent card shows error state with last-known timestamp.

### Flow 2: Pixel Office Observation
**Trigger**: Operator navigates to pixel office
**Goal**: Ambient view of agent activity in spatial context

```
Pixel Office (/pixel-office) --> Watch agents --> Open heatmap overlay --> Close
                                      |
                                      v
                                 Open idle rank --> Identify stuck agents --> Navigate to Sessions
```

**Happy path**: Agents animate through working/idle states. Heatmap shows expected traffic patterns.
**Error states**: Canvas fails to load (fallback to agent list text view). Layout data stale (timestamp indicator).

### Flow 3: Model and Provider Review
**Trigger**: Operator wants to check model availability or usage
**Goal**: See configured providers, model status, usage stats

```
Models (/models) --> Scan provider table --> Expand model details --> [If enabled] Run provider probe
                                                                          |
                                                                          v
                                                                     Probe result inline
```

**Happy path**: Table shows all providers with status indicators. Usage stats populate from cached data.
**Error states**: Provider unreachable (row-level warning). Probe feature disabled (button absent, not greyed out).

### Flow 4: Enable and Use Mutating Feature
**Trigger**: Operator needs to perform a maintenance action (e.g., test outbound message, update alert threshold)
**Goal**: Enable feature via UI toggle, perform action, optionally disable

```
Operator sets UI toggle (e.g. Alerts enable, or Sidebar Experiments) --> Controls become visible
     |
     v
Perform action (e.g. set threshold, trigger tests) --> Result feedback inline
     |
     v (toggle not set)
Feature controls absent --> Read-only view only
```

**Happy path**: Toggle set, controls appear, action succeeds with clear inline feedback.
**Error states**: Toggle not set (controls absent -- no error, just not visible). Action fails (inline error with actionable message, no raw stack traces or paths).

### Flow 5: Security Findings Review
**Trigger**: Maintainer reviews audit posture
**Goal**: Check remediation status across findings

```
SECURITY.md --> Scan finding statuses --> Cross-reference with codebase
     |
     v
SECURITY.md --> Review policy, priorities, and accepted risk
```

**Happy path**: Findings register is current, statuses reflect code state.
**Error states**: Out-of-date findings (detectable by comparing file timestamps to recent commits).

---

## 3. Screen Inventory

| Screen | Route/Path | Purpose | Key Components |
|--------|------------|---------|----------------|
| Home | `/` | Agent overview, gateway health, activity summary | AgentCard grid, GatewayStatus badge, stats summaries |
| Pixel Office | `/pixel-office` | Spatial agent activity visualization | Isometric canvas, agent chips, heatmap overlay, idle rank overlay, edit toolbar, phone panel, token rank |
| Models | `/models` | Provider and model listing, usage stats | Provider table, model detail rows, usage indicators, [gated] probe button |
| Sessions | `/sessions` | Session history per agent with channel badges | Agent selector, session list, channel-type badges (emoji + color), search/filter |
| Stats | `/stats` | Token and performance metrics over time | SVG bar charts, time range tabs, per-agent breakdown |
| Alerts | `/alerts` | Alert rule management and threshold config | Alert rule list, threshold forms, [gated] check-now action, status indicators |
| Skills | `/skills` | Skill inventory with detail overlay | Filterable skill list, full-screen markdown overlay |

---

## 4. Navigation Structure

```
Sidebar (persistent left rail)
|-- Header (Logo, Language & Theme switchers)
|-- Overview
|   |-- Agents (/)
|   |-- Pixel Office (/pixel-office)
|   \-- Models (/models)
|-- Monitor
|   |-- Sessions (/sessions)
|   |-- Stats (/stats)
|   \-- Alerts (/alerts)
\-- Config
    \-- Skills (/skills)
```

**Navigation pattern**: Collapsible left sidebar (224px expanded, 64px collapsed on desktop). Mobile: hamburger-triggered slide-over drawer with backdrop.
**Deep linking**: All seven routes are directly addressable. Sessions support `?agent=` query param. No nested dynamic segments.
**Active state**: Exact match for `/`, startsWith match for all others. Active item uses `var(--accent)` highlight.

---

## 5. Interaction Patterns

### Forms
- **Validation**: Inline, field-level. Errors appear below the field immediately on blur or on value change after first submission attempt.
- **Error display**: Red border on field + error text in `var(--orange)` below. No toast for validation errors -- keep them co-located.
- **Success feedback**: Inline success message or status indicator update. Toast notification only for actions with delayed confirmation (e.g., probe results).

### Modals/Dialogs
- **When modals are used**: Pixel office overlays (heatmap, idle rank, phone panel, token rank). Skills detail view (full-screen overlay). Confirmation before destructive or side-effect actions when mutating features are enabled.
- **When inline is used**: Model detail expansion, session filtering, alert threshold editing.
- **Confirmation dialogs**: Required for any mutating action (message send, alert write, layout save). Dialog states the exact action and its consequences. Cancel is the visually prominent option; confirm is secondary to prevent accidental triggers.

### Loading States
- **Skeleton screens**: Used for card grids (home) and table rows (models, sessions) on initial data fetch.
- **Inline spinners**: Used for individual actions (probe, check-now) that resolve in <5s.
- **Progressive loading**: Pixel office canvas initializes with a placeholder grid, then populates agents as data arrives. Charts render axes first, then bars.

### Notifications
- **Toast**: Transient success/error for completed actions. Auto-dismiss after 5s. Stacks vertically in bottom-right.
- **Banner**: Persistent banner at top of `<main>` when gateway is unreachable or a critical env flag state needs operator attention.
- **Inline**: Status badges and indicators on cards and table rows for per-item state.

### Gated Feature Controls
- **When UI toggle is disabled**: The control (button, form, action) is completely absent from the DOM -- not disabled, not greyed out, not hidden with CSS. The read-only view stands on its own without visual gaps.
- **When UI toggle is enabled**: The control appears inline in its natural position. A subtle label or tooltip indicates this is an enabled optional feature.

---

## 6. Motion and Animation Strategy

### Philosophy
Motion serves wayfinding and ambient liveliness. The pixel office is the animation-heavy zone; the rest of the dashboard uses motion sparingly to indicate state changes and guide attention.

### Entrance Choreography
- **Page load**: Content fades in from `opacity: 0` over 200ms. No stagger on initial load -- speed matters for an operator checking status.
- **Scroll reveals**: Not used. All dashboard content loads above the fold or within scrollable containers that are immediately visible. No scroll-triggered entrance animations.

### Interaction Feedback
- **Hover states**: Cards lift with `translateY(-2px)` + shadow deepening over 150ms. Table rows highlight with background shift to `var(--border)` at 50% opacity.
- **Click/tap responses**: Buttons scale to `0.97` for 100ms on press. Sidebar nav items flash accent background on click before settling to active state.
- **Focus rings**: 2px `var(--accent)` outline with 2px offset. Visible on keyboard focus only (`:focus-visible`).

### Pixel Office Motion
- **Agent movement**: Agents glide between positions over 600ms with ease-out. Working/idle state transitions use 300ms crossfade on chip color.
- **Heatmap overlay**: Fades in over 300ms with slight scale from `0.98`.
- **Edit mode**: Toolbar slides up from bottom over 200ms. Undo/redo actions flash the affected area briefly.

### Animation Constraints
- Maximum 3 elements animating simultaneously per viewport region (pixel office agents are exempt -- they are a single canvas/DOM compositor)
- No linear easing outside pixel office sprite loops
- `prefers-reduced-motion`: Disable pixel office agent movement (show static positions), replace all transitions with instant state changes, keep color/opacity indicators
- Target 60fps -- pixel office is the stress point; test with 6x CPU throttling

---

## 7. Layout Philosophy

### Composition Approach
Information-dense but organized. The dashboard prioritizes scan-ability -- an operator glances at the home page and knows system health in under 3 seconds. Grid layouts for cards, table layouts for lists, full-bleed canvas for pixel office. Consistent section padding. No decorative whitespace.

### Visual Hierarchy
- **Scale contrast**: Gateway status badge is visually dominant on home. Agent cards are uniform and grid-aligned. Section headers use `text-lg` weight, content uses `text-sm`.
- **Negative space**: Moderate. Cards have internal padding (`p-4` to `p-6`), grid gaps at `gap-4`. Sidebar provides structural breathing room. No large hero sections or cinematic whitespace.
- **Section rhythm**: Home alternates between card grid and summary rows. Other pages are single-purpose with one primary content area.

### Section Transitions
Hard cuts between sections within a page. No overlap zones or migration effects. Sidebar acts as the persistent spatial anchor -- content area swaps cleanly.

---

## 8. Responsive Strategy

| Breakpoint | Target | Layout Approach |
|------------|--------|-----------------|
| < 768px | Mobile | Sidebar collapses to hamburger drawer. Card grid becomes single column. Tables scroll horizontally. Pixel office scales to fit viewport width with pinch-zoom. Charts stack vertically. |
| 768-1024px | Tablet | Sidebar collapsed (64px icon rail). Card grid 2 columns. Tables remain full-width. Pixel office uses available width. |
| > 1024px | Desktop | Sidebar expanded (224px) or collapsed per user preference (persisted in localStorage). Card grid 3-4 columns. Full table layouts. Pixel office has room for side panels. |

**Approach**: Desktop-first (the primary use case is an operator at a workstation). Mobile is a secondary check-in mode, not a full operational context.
**Touch targets**: Minimum 44x44px for all interactive elements. Sidebar nav items and card actions meet this at all breakpoints.
**Mobile header**: Fixed `h-14` top bar with hamburger, logo, and theme toggle. Clears on scroll.

---

## 9. Accessibility

**Target**: WCAG 2.1 AA

- **Keyboard navigation**: All interactive elements reachable via Tab. Sidebar navigable with arrow keys. Modal focus trapped. Escape closes overlays. Skip-to-content link on every page.
- **Screen reader**: Semantic HTML (`nav`, `main`, `section`, `table`, `dialog`). ARIA labels on icon-only buttons. Live regions (`aria-live="polite"`) for gateway status changes, action results, and toast notifications.
- **Color contrast**: All text meets 4.5:1 against its background in both themes. Status colors (green, orange, accent) paired with text labels or icons -- never color-only indicators.
- **Focus management**: Focus moves to modal content on open, returns to trigger on close. Focus ring is `var(--accent)` 2px outline, always visible on `:focus-visible`.
- **Reduced motion**: `prefers-reduced-motion` disables all transitions and animations. Pixel office shows static agent positions. State changes are instant. Color and text indicators remain.
- **Zoom**: Layout remains functional at 200% browser zoom. No horizontal scroll at 200% on >= 768px viewports.

---

## 10. Design System

### Color Architecture
- **Dominant surface** (60%): `--bg` -- deep slate (`#0f172a` dark, `#f3f6fb` light). The operational canvas. Cool, recessive, allows status colors to pop.
- **Secondary surfaces** (25%): `--card` -- elevated panels (`#1e293b` dark, `#ffffff` light). Every distinct content group lives on a card.
- **Accent** (10%): `--accent` -- sky blue (`#38bdf8` dark, `#0369a1` light). Active nav, primary actions, links. ONE accent element dominates per viewport region.
- **Signal colors** (5%): `--green` for healthy/success, `--orange` for warning/error, `--accent2` (purple) for secondary categorization. Always paired with text labels.

**Palette character**: COOL, SYNTHETIC, QUIET. Dark mode is the primary design target; light mode is a functional accommodation.

### Typography
- **Display font**: System stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`). The dashboard does not need typographic personality -- it needs instant rendering and platform familiarity.
- **Body font**: Same system stack. Optimized for `text-sm` (14px) density in tables and cards.
- **Monospace**: `ui-monospace, "Cascadia Code", "Fira Code", monospace` for token counts, session IDs, and code-adjacent values.
- **Scale**: `text-xs` (12px) for badges and metadata, `text-sm` (14px) for body and table content, `text-base` (16px) for section labels, `text-lg` (18px) for page titles, `text-xl` (20px) for home hero stats.
- **Minimum body size**: 14px on desktop, 16px on mobile (browser default).

### Spacing Scale
4px (`gap-1`), 8px (`gap-2`, `p-2`), 12px (`gap-3`, `p-3`), 16px (`gap-4`, `p-4`), 24px (`gap-6`, `p-6`), 32px (`gap-8`), 48px, 64px. Card internal padding is `p-4` to `p-6`. Grid gaps are `gap-4`. Page padding is `p-4` mobile, `p-6` desktop.

### Elevation and Depth
Flat with borders. Cards use `border: 1px solid var(--border)` and `border-radius: 0.5rem`. No box shadows in the default dark theme (dark-on-dark shadows are invisible). Light theme may add `shadow-sm` for card lift. Pixel office overlays use `backdrop-blur` for modal panels. Z-index layers: content (0), sidebar (40), mobile header (50), overlays (60-70), toasts (80).

### Texture and Atmosphere
Clean and minimal. No gradient meshes, noise, or grain. The pixel office sprites provide all the visual texture the dashboard needs. Background is flat `var(--bg)`. Cards are flat `var(--card)`. The contrast between the clean dashboard shell and the pixelated office art IS the texture.

---

## 11. Component Patterns

| Component | Used In | Behavior |
|-----------|---------|----------|
| AgentCard | Home | Displays agent name, status badge, channel, session count. Clickable to drill into sessions. Status color-coded (working/idle/error). |
| GatewayStatus | Home | Connection badge with dot indicator. Green = connected, red = unreachable. Polls on interval. |
| DataTable | Models, Sessions | Full-width responsive table with sortable headers. Horizontal scroll on mobile. Row hover highlight. |
| StatusBadge | All pages | Pill-shaped badge with color + text label. Never color-only. Sizes: sm (tables), md (cards). |
| InlineOverlay | Pixel Office, Skills | Inline full-screen or anchored overlay with backdrop. Escape to close. |
| TrendChart & BarChart | Home, Stats | SVG charts for token and response trends. |
| InlineThresholdForm | Alerts | Inline form inputs for alert threshold values. Field-level updates. |
| NavPixelIcon | Sidebar | Custom SVG icons with pixel-art aesthetic. Accent color when active. |
| InlineToast | Alerts | Bottom-right fixed notices for transient feedback (e.g. "Saved"). |
| InlineFeatureGate | All gated routes | Conditional rendering based on UI config toggles. Renders nothing when disabled. |

---

## 12. Anti-Patterns to Avoid

- **Disabled states for inactive features**: Avoid completely hiding controls for temporarily inactive features if seeing them provides context. Instead, disable them (e.g., greyed out threshold inputs when a rule is off) to show what becomes available when enabled. However, completely absent/unconfigured global features should be hidden to avoid clutter.
- **Raw error surfaces**: Never expose stack traces, filesystem paths, or gateway tokens in error messages. Every error the operator sees must be a human-readable sentence with an actionable next step.
- **Color-only status indicators**: Every status color must be paired with a text label or icon. An operator with color blindness must get the same information.
- **Animation for animation's sake**: Outside the pixel office, motion must serve a functional purpose (state change feedback, spatial orientation). No decorative loading animations, no parallax, no entrance flourishes on the monitoring pages.
- **Modal overuse for actions**: Confirmations for destructive/side-effect actions are modals. Everything else (filtering, expanding details, editing thresholds) stays inline. Modals interrupt flow and should be reserved for "are you sure?" moments.

---

## 13. Open UX Questions

1. Should the pixel office edit mode (layout changes) be gated behind the same env toggle system as other mutating features, or does it warrant its own separate toggle?
2. Should the mobile experience support landscape orientation for the pixel office canvas, or is portrait-only acceptable for the secondary check-in use case?
3. Is the `lang="zh-CN"` default intentional for all deployments, or should the default language be configurable via env or auto-detected from browser locale?
