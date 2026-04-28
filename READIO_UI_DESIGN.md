# Readio UI Design Guidelines

## 1. Product direction

Readio is a mobile-first reading app. UI exists to support reading, not to compete with text. Reader UI should feel calm, contextual, lightweight, and theme-aware.

Core principles:

1. Reading content has the highest visual priority.
2. Reader controls are contextual overlays, not permanent app chrome.
3. All new UI must adapt to the active reading theme.
4. Do not hard-code colors for normal UI. Use semantic theme tokens/classes.
5. AI assistant UI is a reader-native overlay, not a generic chat page or settings tab.

## 2. Existing theme architecture

Readio inherits Readest's theme system. Use it instead of creating one-off color constants.

Key files:

- `apps/readest-app/src/styles/themes.ts`
  - Defines `ThemeMode`, `Palette`, built-in themes, custom theme generation, OKLCH/fallback variables.
- `apps/readest-app/tailwind.config.ts`
  - Registers each theme as DaisyUI themes: `${themeColor}-light` and `${themeColor}-dark`.
- `apps/readest-app/src/store/themeStore.ts`
  - Stores active `themeMode`, `themeColor`, and system dark mode.
- `apps/readest-app/src/hooks/useTheme.ts`
  - Applies `document.documentElement.dataset.theme = ${themeColor}-${colorScheme}` and `color-scheme`.
- `apps/readest-app/src/utils/style.ts`
  - Generates reader document CSS variables: `--theme-bg-color`, `--theme-fg-color`, `--theme-primary-color`.

Important boundary:

- React app shell UI should use DaisyUI/Tailwind semantic classes.
- EPUB/PDF/iframe reader content should use the injected `--theme-*` variables from `getThemeCode()` / `getColorStyles()`.

## 3. Required semantic tokens/classes

Use these for new React UI:

### Background

- `bg-base-100`: main surface
- `bg-base-200`: secondary surface, bottom bars, subtle elevated areas
- `bg-base-300`: selected/active background, stronger surface
- `bg-base-content/5`, `bg-base-content/10`, `bg-base-content/20`: theme-aware scrim or subtle overlays

### Text

- `text-base-content`: primary UI text
- `text-base-content/70`: secondary text
- `text-base-content/60`: hints and muted labels
- `text-primary`: small-area emphasis or active state
- `text-primary-content`: text on `bg-primary`
- `text-error`: errors

### Border, focus, selected state

- `border-base-content/10`: normal divider/border
- `border-base-300`: stronger border
- `border-primary/30` or `border-primary/40`: selected/focused semantic border
- `ring-primary`
- `ring-offset-base-100` or `ring-offset-base-200`

### Controls

- Tool icon button: `btn btn-ghost`
- Active tool button: `btn btn-ghost bg-base-300 text-primary`
- Primary CTA: `btn btn-primary`, only for small, explicit actions
- Inputs: `input input-bordered bg-base-100 text-base-content placeholder:text-base-content/50`
- Toggles: use sparingly; prefer compact pills inside reader overlays when the setting is secondary.

## 4. Prohibited patterns

Do not introduce these in product UI:

1. Fixed theme colors such as `#ffffff`, `#000000`, `#4a90e2`, `rgb(...)`, `rgba(...)` for normal UI surfaces/states.
2. Fixed Tailwind color families for semantic UI: `bg-blue-*`, `text-blue-*`, `border-blue-*`, `ring-indigo-*`, `bg-white`, `bg-black`, `text-white`, `text-black`.
3. Large `bg-primary` surfaces in reader overlays. Primary can become vivid in some themes; keep it to buttons, focus rings, and small emphasis.
4. Generic system dialogs for reader-native interactions.
5. UI that only looks acceptable in the default light theme.
6. Floating controls that remain visually loud during reading.
7. Icon buttons without `aria-label`.
8. Touch targets below 44px on mobile.

Allowed exceptions:

- Theme definitions and theme preview swatches may use raw colors.
- Tests may use raw colors when asserting theme generation.
- Brand assets/icons may use fixed colors if intentionally designed.
- Very specific non-theme technical effects may use raw alpha colors only after review.

## 5. Reader overlay rules

Reader overlays include bottom bars, progress controls, AI panels, selection menus, popovers, and inline prompts.

They must:

1. Use theme-aware surfaces (`base-*`) and borders.
2. Preserve reading context; avoid full-screen takeover unless the user explicitly enters expanded mode.
3. Avoid large high-saturation areas.
4. Respect safe areas and keyboard insets on Android/iOS.
5. Provide an obvious close path.
6. Use compact typography and spacing.
7. Hide or de-emphasize when reading resumes.

Recommended overlay structure:

```tsx
<div className='bg-base-content/20 absolute inset-0 z-50 flex items-end'>
  <section className='bg-base-100 text-base-content border-base-content/10 mx-3 mb-3 rounded-[1.5rem] border shadow-2xl'>
    ...
  </section>
</div>
```

Adjust exact radius/spacing through Tailwind scale, but keep token usage.

## 6. AI assistant UI rules

The AI assistant must follow the approved reader-native prototype direction:

1. Entry from selected text: compact AI action in the selection toolbar.
2. Entry from reader controls: low-distraction floating AI button near the lower-right control area.
3. First state: bottom ask sheet with three suggestion chips and an input row.
4. Answer state: expanded reader overlay/panel with answer content and follow-up input.
5. Spoiler protection is a visible switch/pill and defaults to enabled.
6. The assistant should say it answers based on the current reading context and avoids future content unless spoiler protection is disabled.

Visual requirements:

- Bottom ask sheet should be a floating rounded card, not a full-width system modal.
- The floating AI entry button should be quiet, icon-first, close to the lower control area, and never a loud text badge competing with reading content.
- Suggestion chips use `bg-base-100` or `bg-base-200` / `text-base-content`, selected/active state uses subtle primary accents such as `bg-primary/10`, `border-primary/40`, and `text-primary`.
- Suggestion chips may sit in a single horizontal scrolling row on mobile, but must be visually verified for clipping and drag discoverability.
- Spoiler protection is a scope/status control, not a suggestion. It must be smaller than suggestions, use distinct copy such as `防剧透开启` / `允许查看后文`, and keep a state-specific accessible name.
- Lightweight ask sheets should close from both the explicit `X` button and a click/tap on the outside scrim. Full answer panels do not need outside-click dismissal unless an outside area exists.
- Composer rows should look like one coherent control: one rounded outer surface, transparent input interior, consistent inner radius, and token-based disabled/focus states.
- Send button may use `btn-primary`, but only as a small CTA.
- Answer content should feel like explanatory reading cards, not a loud generic chat interface.
- Prefer `base-*` surfaces plus subtle primary accents over large primary-colored bubbles.

Current known gap:

- Expanded answer state is still full-screen. This is acceptable for now, but future refinements should keep it reader-native and avoid generic chat-page chrome.

## 7. Component standards

### Buttons

- Minimum mobile hit target: 44px × 44px.
- Icon-only buttons must have `aria-label`.
- Use `btn-ghost` for reader tools.
- Use `btn-primary` only for explicit commit actions such as Send/Import/Confirm.
- Disabled/loading state must be visually clear and not rely only on color.

### Chips

- Use chips for suggestions, filters, and compact options.
- Minimum hit target should still reach 44px height, even if visual chip is smaller.
- Use token-based styles, not fixed warm/cool colors.
- Selected state must not rely on color only; add weight, border, icon, or surface change where appropriate.

### Inputs

- Use theme-aware input background, text, placeholder, border, and focus ring.
- Must not be hidden by keyboard or system navigation bars.
- Long text input should grow only to a capped height, then scroll internally.

### Panels

- Reader bottom sheets should use rounded top/floating card shape depending on context.
- Full panels should use `bg-base-100` or `bg-base-200`, not fixed white/black.
- Use `border-base-content/10` for dividers.

## 8. Accessibility baseline

1. UI text contrast should meet WCAG AA where practical.
2. Reader body contrast should be higher than generic UI; do not reduce readability for aesthetics.
3. Support font scaling without clipping critical actions.
4. Respect reduced-motion preferences for panel animation.
5. Maintain keyboard/focus behavior for web and desktop surfaces.
6. Use semantic labels for controls.

## 9. Current theme risks to clean up opportunistically

Do not fix unrelated files during every task, but when touching these areas, replace fixed styles with tokens:

- `apps/readest-app/src/components/settings/color/ThemeColorSelector.tsx`
  - `ring-indigo-500` should become `ring-primary` with a theme-aware ring offset.
- `apps/readest-app/src/styles/globals.css`
  - `.drag-over` uses fixed `#4a90e2` and fixed rgba blue; prefer `border-primary` / `bg-primary/10` style.
- AI assistant reader UI
  - Avoid full-width generic modal feel; align to the floating reader-native prototype using tokenized surfaces.

## 10. Code review checklist

For every new or changed Readio UI:

```text
[ ] No hard-coded product UI colors outside allowed exceptions.
[ ] Uses DaisyUI/Tailwind semantic theme tokens/classes.
[ ] Works in default, sepia, grass, dark, and contrast themes.
[ ] Reader content remains visually dominant.
[ ] Reader overlays use low-distraction base surfaces, not large primary areas.
[ ] Mobile touch targets are at least 44px.
[ ] Icon buttons have aria labels.
[ ] Input and bottom sheet respect keyboard and safe-area insets.
[ ] Selected/focused/disabled/loading states are defined.
[ ] AI assistant UI matches the reader-native bottom-sheet/panel direction, not generic chat UI.
```

## 11. Required local skills for Readio UI/mobile work

Use this project-specific skill matrix before design or implementation. Readio is currently a Tauri + React/Next reader app packaged for Android, so the default set is web/mobile UI plus Android APK validation, not native SwiftUI/Compose unless that layer is touched.

### Always use for Readio UI changes

1. `/ui-ux-pro-max`
   - Use for any change that affects visual structure, interaction, spacing, typography, motion, sheets, modals, buttons, inputs, chips, navigation, or perceived polish.
   - Apply its priority order first: accessibility, touch/interaction, layout/responsive, then visual style.
2. `/accessibility`
   - Use for every UI change with interactive controls.
   - Must verify labels, roles, focus/escape behavior, touch target size, contrast, dynamic text, and modal/sheet dismissal.
3. `/design-system`
   - Use when changing global UI rules, theme tokens, repeated component styles, or when the UI feels inconsistent.
   - Must be used before adding new colors, radii, shadows, typography scales, or overlay patterns.

### Use for Android release and emulator work

4. `/android-development`
   - Use for Android APK build/install/validation, emulator smoke tests, WebView/safe-area/system-bar behavior, Android file picker/import behavior, and Play/manifest/package concerns.
   - For Readio, this is mostly validation and platform-shell guidance because product UI lives in React/Tauri.

### Use only if the project layer changes

5. `/compose-multiplatform-patterns`
   - Use only if Readio starts adding real Jetpack Compose / Compose Multiplatform UI. Do not use for ordinary React/Tauri UI.
6. `/android-clean-architecture`
   - Use only if Android-native data/domain/presentation layers are added or significantly reorganized.
7. Kotlin skills: `/kotlin-patterns`, `/kotlin-coroutines-flows`, `/kotlin-testing`, `/kotlin-multiplatform`
   - Use only when editing Kotlin code beyond generated Tauri shell glue.
8. iOS skills: `/ios-development`, `/swiftui-patterns`, `/liquid-glass-design`, `/foundation-models-on-device`, `/swift-concurrency-6-2`, `/swift-protocol-di-testing`, `/swift-actor-persistence`
   - Use only for iOS app work, native Swift/SwiftUI surfaces, iOS-specific packaging, or Apple on-device model integrations.
9. Flutter skills: `/flutter-development`, `/dart-flutter-patterns`, `/flutter-dart-code-review`
   - Not applicable to current Readio unless the project adopts Flutter.
10. `/react-native`

- Not applicable to current Readio unless the project adopts React Native/Expo.

### Practical invocation rule

For any Readio UI task, start with:

```text
/ui-ux-pro-max + /accessibility
```

Add `/design-system` when the change affects reusable style rules or theme behavior. Add `/android-development` before delivering or validating an Android APK.

## 12. Practical implementation rule

When implementing UI, start with this question:

> If the user switches from default light to sepia, grass, dark, or contrast, will this component still look intentional?

If the answer depends on a fixed hex value or a default blue control, the implementation is not acceptable for Readio.
