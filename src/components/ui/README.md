# components/ui

Shared, themed presentational components. Import from the barrel:

```ts
import { Button, Card, Screen, StateView, LockedState, Text, ToastProvider, useToast } from '@/components/ui';
```

- `Text` — themed text with `variant` (body/title/caption) and `color` tokens.
- `Button` — pressable with `primary` / `secondary` / `danger` variants, `loading`
  and `disabled` states, and a `button` accessibility role.
- `Card` — rounded themed surface for grouping content.
- `Screen` — safe-area-aware screen container; `scroll` and `center` modes.
- `StateView` — consistent loading / empty / error / offline states (never a
  blank screen), with optional retry.
- `LockedState` — shown when a feature is locked; names the unlocking lesson.
- `Toast` — `ToastProvider` (mounted in the root layout) + `useToast()` hook for
  transient messages.

All components read colors, spacing, radii, and typography from `src/theme`
tokens so light/dark mode is a single source of truth.
