# Android responsive UI (experimental)

## Goal

Make Writer usable in an Android webview (phone viewport, touch, no
keyboard, no window chrome) without changing a single pixel on desktop.
All Android behavior is gated behind one UA check; every Android style is
scoped under `html[data-platform="android"]`, so desktop selectors can
never match.

Non-goals: an APK build (`tauri android init`, SDK/NDK CI, signing),
Android file-system access model changes, long-press context menus,
virtual-keyboard-aware resizing. Each is a separate follow-up.

## Gate (single source of truth)

- `lib/platform.ts` gains `isAndroid()` — `/Android/i` on
  `navigator.userAgent`, `false` when `navigator` is undefined. Same UA
  pattern as the existing `detectPlatform()`, no new dependencies (no
  `plugin-os`, no Rust changes).
- `main.tsx` sets `document.documentElement.dataset.platform =
  "android"` once at startup when `isAndroid()`. Module scope, not an
  effect. This is the only write path for the gate.
- `components/app-layout.tsx` computes `const IS_ANDROID =
  isAndroid()` once at module scope and renders `<AndroidLayout />`
  instead of `<WorkspaceLayout />`. The desktop component is untouched.

Verification that desktop is unchanged: `git diff` on the desktop path
is structural only (early branch); no shared class or style is edited,
and every new style rule carries the `html[data-platform="android"]`
prefix.

## Layout (`AndroidLayout`, new branch in `app-layout.tsx`)

- Sidebar becomes an overlay drawer reusing the existing `<Sidebar />`
  unchanged: fixed left sheet (`85vw`, max `340px`), backdrop tap and
  the toggle button close it. Open state reuses
  `appearance.sidebar-visible` via `useSidebar()`, so the preference
  stays one value on both layouts.
- No drag region, no resize handle, no 92px traffic-light padding on
  the toggle row. `<EditorTabs />` renders in normal flow, full width.
- Stable hook classes with no desktop styles attached (`editor-pane`,
  `settings-page`) give the Android stylesheet something to target.

## Styles (`android.css`, imported by `App.tsx`)

All rules prefixed with `html[data-platform="android"]`:

- Safe-area insets (`env(safe-area-inset-*)`) on the root and top bar
  for the status bar and gesture bar.
- Command palette `[cmdk-dialog]` becomes a top sheet (full width,
  `88dvh` max) instead of a centered 560px card; `[cmdk-item]`
  padding grows to a 44px touch target and `[cmdk-list]` to `50dvh`.
- Editor and settings page top padding shrinks (`pt-32`/`9rem` assume
  a desktop titlebar area); toggle and tab-close targets grow to 44px.
- No `maximum-scale=1` or UA-based font bumps: text stays zoomable.

## Verification

- `vp check` and `vp test` pass, including new
  `tests/platform.test.ts` covering `isAndroid()` UA cases.
- Manual: `vp dev` with a mobile viewport + Android UA spoof —
  drawer opens/closes, palette is a full-width sheet, editor and
  settings fit 360px wide. Desktop run is visually unchanged.

## Follow-ups (not this patch)

- Auto-close the drawer on file open; long-press file context menus.
- `visualViewport`-driven resize when the virtual keyboard opens.
- `tauri android init` + APK CI once the UI is proven.
