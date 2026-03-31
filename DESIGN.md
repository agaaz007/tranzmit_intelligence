# Design System — Tranzmit

## Product Context
- **What this is:** AI-native session analytics platform — session replay, UX friction detection, churn scoring, user recovery
- **Who it's for:** Product managers, UX researchers, and growth teams at B2B SaaS companies
- **Space/industry:** Session analytics (PostHog, Hotjar, FullStory, Amplitude, LogRocket)
- **Project type:** Web app / analytics dashboard

## Aesthetic Direction
- **Direction:** Industrial Warmth — dark control-surface with warm neutrals and muted terracotta signal
- **Decoration level:** Intentional — subtle noise texture on dark surfaces, thin 1px terracotta rule lines as section dividers. No blobs, no gradients, no illustrations
- **Mood:** A warm intelligence instrument. Confident density, organic warmth, not cold SaaS. The product feels like it's always watching, always analyzing — but approachably so. Like warm leather, not cold glass
- **Reference sites:** autumnai.com (warm neutrals), linear.app (restraint and typography)

## Typography
- **Display/Hero:** General Sans 700, -0.02em tracking — geometric with character, freely available, not overused
- **Body:** DM Sans 400/500 — clean, highly legible at small sizes, supports tabular-nums for data alignment
- **UI/Labels:** DM Sans 500
- **Data/Tables:** JetBrains Mono 500 — metrics, timestamps, session IDs, code. Must use tabular-nums
- **AI Voice:** Instrument Serif Italic 16-18px, 1.65 line-height — used exclusively for AI analysis prose blocks. This gives the AI a distinct typographic voice, separate from the rest of the interface
- **Code:** JetBrains Mono 400
- **Loading:** Google Fonts CDN
- **Scale:**
  - hero: 48px / 700 / -0.03em
  - h1: 36px / 700 / -0.02em
  - h2: 28px / 700 / -0.02em
  - h3: 22px / 600 / -0.01em
  - body-lg: 17px / 400
  - body: 15px / 400
  - small: 13px / 400
  - caption: 12px / 500
  - mono-label: 10px / 500 / uppercase / 0.08-0.1em tracking

## Color

### Approach
Restrained warm — brown-blacks instead of blue-blacks. Terracotta accent that feels designed, not default. The warmth is in the canvas itself, not in saturation.

### Dark Mode (default)
| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| --bg | Umber | #12110F | Page background |
| --surface | Walnut | #1C1A17 | Cards, panels, elevated containers |
| --surface-hover | — | #242220 | Hover states on surfaces |
| --border | Driftwood | #2E2B27 | Dividers, input borders, separators |
| --border-hover | — | #3D3934 | Hover/focus borders |
| --text-primary | Parchment | #EBE6DF | Primary text — warm off-white, never pure #FFF |
| --text-muted | Stone | #9A9490 | Secondary text, descriptions |
| --text-subtle | — | #6B6560 | Tertiary text, placeholders |
| --accent | Terracotta | #C2715A | CTAs, active states, links, the "signal" |
| --accent-hover | Clay | #A85D48 | Hover states on accent |
| --accent-soft | — | rgba(194,113,90,0.10) | Accent-tinted backgrounds (active nav, tags) |
| --accent-glow | — | rgba(194,113,90,0.12) | Focus rings on inputs |
| --danger | Vermillion | #E5453A | Churn risk, friction, errors, rage clicks |
| --danger-bg | — | rgba(229,69,58,0.12) | Danger badge/alert backgrounds |
| --success | Sage | #6AAF8A | Recovery wins, healthy metrics, positive deltas |
| --success-bg | — | rgba(106,175,138,0.10) | Success badge/alert backgrounds |
| --warning | Ochre | #C49A5C | Elevated risk, pending states |
| --warning-bg | — | rgba(196,154,92,0.10) | Warning badge/alert backgrounds |
| --info | Slate | #7A8BA6 | Informational badges, neutral states |
| --info-bg | — | rgba(122,139,166,0.10) | Info badge/alert backgrounds |

### Light Mode
| Token | Name | Hex |
|-------|------|-----|
| --bg | Linen | #F5F1EB |
| --surface | Cream | #FEFCF9 |
| --surface-hover | — | #F0ECE5 |
| --border | — | #DDD8D0 |
| --border-hover | — | #C8C2B8 |
| --text-primary | — | #2A2620 |
| --text-muted | — | #6B6560 |
| --text-subtle | — | #9A9490 |
| --accent | — | #B0654E |
| --accent-hover | — | #964F3A |
| --danger | — | #D93830 |
| --success | — | #4A8E68 |
| --warning | — | #A8843A |
| --info | — | #5A7090 |

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** Editorial-asymmetric — left-heavy compositions, data rails on the right
- **Grid:** 12-column, responsive
- **Max content width:** 1120px
- **Border radius:** Tight — sm:4px, md:6px, lg:8px (not bubbly). Sharp corners + dark surfaces = precision instrument

## Motion
- **Approach:** Minimal-functional — only opacity/transform transitions that aid comprehension
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-350ms)
- **No spring animations, no decorative motion**

## AI Voice Treatment
When the AI speaks (analysis summaries, friction insights, recommendations), use:
- Font: Instrument Serif Italic
- Size: 16-18px, line-height 1.65
- Left border: 2px solid var(--accent)
- Padding-left: 16px
- This creates a distinct "authored intelligence" voice that's visually separate from the data/UI layer

## Anti-patterns (never use)
- Purple/violet gradients
- 3-column feature grids with icons in colored circles
- Centered everything with uniform spacing
- Bubbly border-radius (12px+) on cards
- Gradient buttons
- Decorative blobs or abstract illustrations
- Pure #000000 or #FFFFFF — always use the warm variants
- Cold blue-blacks — always warm

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-31 | Initial design system created | Fresh direction away from generic blue SaaS. Warm dark palette with terracotta accent differentiates from PostHog/Hotjar/FullStory (all cold blue/teal/purple). Three-register typography with serif AI voice. Informed by competitive research + Autumn AI warmth reference + Codex and Claude subagent outside voices. |
| 2026-03-31 | Danger red set to #E5453A | Original muted red (#D4594C) didn't command enough attention. Bumped to vivid vermillion that pops against warm dark backgrounds. |
