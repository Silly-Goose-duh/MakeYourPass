# CampusPass — UI Design System (v3 "Aurora")

> Zero-context handoff doc for the UI rework. Written for another engineer/agent
> picking this up cold. Describes the design language, where the tokens live, and
> how to extend surfaces without breaking existing components.

## Direction

The UI is a **premium event-platform dark theme** inspired by Luma / Partiful.
It keeps the app's original dark foundation but elevates it:

- **Layered warm-neutral backgrounds** (`#0A0A0F` base → `#12121A` surface → `#191922` card → `#212130` elevated) for real depth instead of a flat plane.
- **Signature violet→fuchsia gradient** (`#8B5CF6 → #E248D8`), replacing the old purple→cyan. Cyan (`#22D3EE`) is retained as a secondary "spark" accent only.
- **Higher-contrast text** (`#F4F4F8` primary, `#B4B7C8` muted) — the previous muted grey failed contrast checks on cards.
- **Ambient aurora backdrop** — a fixed, non-interactive radial-gradient wash behind all content (`body::before`).
- **Glassmorphism navbar** — frosted blur that gains a border + shadow on scroll.
- **Elevation** — cards and primary buttons now carry real shadows (`--shadow-card`, `--shadow-elevated`, glow on hover).

## Where it lives

Everything is driven from **`src/index.css`** via a Tailwind v4 `@theme` block.
Components consume CSS custom properties (e.g. `var(--color-cp-bg-card)`) and
Tailwind color aliases (`bg-brand`, `text-brand-light`). **Retuning a token in
`index.css` restyles the whole app** — this is the primary extension point.

### Key token groups (all in `@theme`)
| Group | Tokens |
|---|---|
| Backgrounds | `--color-cp-bg-base/surface/card/elevated` |
| Accents | `--color-cp-accent-purple/fuchsia/cyan`, `--color-accent-rose/teal`, `--color-primary-hover` |
| Text | `--color-cp-text-primary/muted/faint` |
| Gradient | `--gradient-brand`, `--gradient-brand-soft` |
| Elevation | `--shadow-card`, `--shadow-elevated`, `--shadow-glow` |

**Backward-compat aliases** (`--color-brand`, `--color-void`, `--color-dark`,
`--color-text-primary`, etc.) are intentionally kept so pre-existing components
keep working. Do **not** delete them without auditing every consumer.

### Utility classes (in `index.css`)
- `.gradient-text` — clips `--gradient-brand` to text (used by hero/splash).
- `.glass` — frosted blur surface (navbar, floating panels).
- `.filter-chip` / `.filter-chip.active` — pill filters.
- `.pulse-dot`, `.animate-float`, `.animate-shimmer` — motion accents.

## Files touched in the rework
- `src/index.css` — full token + utility refresh (the core of the change).
- `src/components/layout/Navbar.tsx` — glass navbar, scroll-reactive border/shadow, gradient logo & avatar.
- `src/components/layout/Footer.tsx` — gradient logo mark.
- `src/pages/Home.tsx` — event-card elevation + hover glow, gradient CTA, honest section label (was hardcoded "UPCOMING" over past events → now dynamic "All Events" / "Results").
- `src/components/ui/Button.tsx` — primary button gradient-brightness hover + glow shadow.
- `src/components/ui/Card.tsx` — default card shadow.

## Conventions / pitfalls
- **Add colors as tokens**, not inline hex. Inline `linear-gradient(...#7C5CFC...)`
  values were the old scheme; new code should use `var(--gradient-brand)`.
- Many components use **inline `style` + `onMouseEnter/Leave`** for hover (not
  Tailwind `hover:`). Match that pattern when editing those files, or the hover
  won't fire.
- Respect `prefers-reduced-motion` — a global override already neutralizes
  animations; don't add JS-driven motion that ignores it.
- Fonts: display + body are both **Space Grotesk**; Inter & Syne are bundled via
  `@fontsource` and available if needed.

## Verification (all passing as of this rework)
- `npm run build` → ✓ (tsc -b + vite build, 0 errors)
- `npm run lint` → ✓ (eslint, 0 errors)
- `npm run preview` → served on :4173, homepage renders, **0 console errors / 0 JS errors**.

## Needs human testing
- Contrast ratios were improved by eye + vision analysis, not measured with a
  formal WCAG tool — worth a Lighthouse/axe pass.
- Authenticated surfaces (Dashboard, MC Panel, Create/Edit Event, Analytics) were
  not visually re-reviewed post-rework since they require live Supabase auth; they
  inherit the new tokens automatically but should be spot-checked in a real session.
- Backdrop-filter (`.glass`) degrades gracefully but looks best on Chromium; verify on Safari/Firefox.
