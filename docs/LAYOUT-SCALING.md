# Responsive layout (no global scaling)

Layout is **responsive**, not letterbox-scaled. There is **no** `scale = min(scaleX, scaleY)` and **no** `transform: scale()` on the root. The design baseline is **360px** minimum width; the UI expands with normal flow and responsive rules.

---

## `lib/layout-scale.tsx`

- **Provides:** `breakpoint` (compact &lt;640, regular 640–1024, expanded ≥1024), `width`, `height`, `safeArea` (insets; on web 0, use `env(safe-area-inset-*)` in CSS for iOS).
- **No scale factors** used for sizing. `s(v)`, `sx(v)`, `sy(v)` are **identity** (return `v`) so existing code keeps working; migrate layout sizes to rem/clamp or responsive classes over time.
- **Constants:** `REF_W = 360` (minimum layout baseline).
- **CSS vars set:** `--layout-width`, `--layout-height`, `--layout-ref-w` (no scale vars).
- **DEBUG_LAYOUT:** when `NEXT_PUBLIC_DEBUG_LAYOUT=true`, a small debug panel shows **viewport size** and **breakpoint** only (no reference frame).

---

## Global CSS

- **Typography:** `html { font-size: clamp(14px, 1.2vw + 2px, 16px); }`.
- **App shell:** `.appShell` — `min-height: 100dvh`, padding via `env(safe-area-inset-top)`, etc. (body has class `appShell`).
- **Content column:** `.content` — `max-width: min(100%, 520px)`, `margin: 0 auto`; at `>= 1024px` max-width becomes `720px`. Use for centered single-column content.
- **No** `.scale-s` / `.scale-x` / `.scale-y` utilities.

---

## Layout strategy

- **Mobile:** Full width (360–420px logical), normal vertical scroll.
- **Tablet/desktop:** Center main column with `.content` (max-width 520px, 720px at expanded) or switch to multi-column at breakpoint.
- **Height:** Always scrollable; never shrink UI to fit viewport height.
- **Breakpoints:** Change layout structure (e.g. columns, visibility), not global scale.

---

## Images

Keep **object-fit: contain** (or equivalent) so images keep aspect ratio and do not stretch.

---

## Changed files (summary)

| File | Change |
|------|--------|
| **lib/layout-scale.tsx** | Removed letterbox scaling; provider only gives breakpoint, viewport, safeArea; s/sx/sy = identity; debug overlay shows viewport + breakpoint only. |
| **app/globals.css** | Removed scale CSS vars and scale utilities; added html clamp, .appShell (min-height 100dvh + safe-area padding), .content (max-width + margin auto). |
| **app/layout.tsx** | Body has class `appShell`. |
| **components/layout-scale-provider.tsx** | Unchanged (still wraps provider + DebugLayoutOverlay). |

Existing use of `s()/sx()/sy()` in components now behaves as fixed px (identity); no visual scaling. For new or refactored UI, prefer rem, clamp(), or Tailwind responsive classes and `.content` where appropriate.

---

## Acceptance

- No letterboxing from scale-to-fit height.
- No global transform scaling on root.
- UI readable on 1366×768; buttons/text not shrunk; vertical scroll works.
- Breakpoints drive layout structure, not scale.
