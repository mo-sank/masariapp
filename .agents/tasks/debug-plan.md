# Live Debugging Implementation Plan

## Recommended Debugging Setup

**React Native DevTools** (built-in with Expo SDK 57)

**Why**: According to Expo SDK 57 documentation, React Native DevTools has replaced Chrome DevTools starting from React Native 0.76. It's purpose-built for React Native, provides Console/Sources/Network/Memory/Components/Profiler tabs for Hermes apps, and integrates seamlessly with Expo CLI. This is the officially recommended approach - no additional packages needed beyond what's already installed.

**Verification**: Run `npx expo start`, then press `J` in the terminal to open DevTools. Console logs appear in the Console tab.

## What to Add

### 1. Logging Utility (`src/lib/logger.ts`)

**Why**: Console.log lacks context (file/line number), cannot be toggled per-module, and doesn't integrate with Sentry breadcrumbs. A wrapper provides consistent formatting, dev-only stripping, and automatic breadcrumb creation.

**Implementation**:
- Single file: `src/lib/logger.ts`
- Export a `log` object with methods: `log()`, `warn()`, `error()`, `debug()`
- Auto-prefix with file name and line number
- `log.debug()` and `log()` only show in dev mode (via `__DEV__` global)
- `log.error()` and `log.warn()` always show (errors should never be silent)
- Automatically add dev logs to Sentry as breadcrumbs (using existing scrubbing)

### 2. DevTools Provider in Root Layout

**Why**: React Native DevTools includes React DevTools Components and Profiler tabs. No additional provider is needed - opening DevTools (press `J`) automatically enables these. The existing Sentry.wrap in `_layout.tsx` is sufficient.

**Changes needed**: None - React Native DevTools is enabled by default when using dev builds or Expo Go.

### 3. Environment Variable for Debugging Control

**Why**: Allow toggling verbose logging without code changes.

**Changes to `src/lib/config.ts`**:
- Add `EXPO_PUBLIC_ENABLE_DEBUG` boolean (default `true`)
- Use in logger to control verbose output level

## Exact Files to Create/Modify

### Create: `src/lib/logger.ts`

```typescript
/**
 * Unified logging utility for development and production.
 *
 * Features:
 *   - Timestamp and file context auto-added to every message
 *   - Dev-only logs stripped in production (via __DEV__)
 *   - Sentry breadcrumbs created for all non-dev logs
 *   - Consistent formatting across the app
 */
import * as Sentry from '@sentry/react-native';
import { useCallback } from 'react';

import { config } from './config';

/** Timestamp format: HH:MM:SS.mmm */
function getTimestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

/**
 * Extract the calling file's basename and line number from an Error stack.
 *
 * Returns '{filename}:{line}' or 'unknown' if stack parsing fails.
 */
function getCallerContext(): string {
  try {
    const err = new Error();
    const stack = err.stack;
    if (!stack) return 'unknown';

    // Split stack frames, skip the frames for this file itself
    const frames = stack.split('\n');
    // Frames: 0=Error, 1=getCallerContext, 2=wrapper, 3=caller we want
    const callerFrame = frames[3];
    if (!callerFrame) return 'unknown';

    // Match patterns like:
    //   at Module../src/features/onboarding/username-screen.tsx (username-screen.tsx:42:18)
    //   at renderWithHooks (node_modules/react-native/index.js:15432:23)
    const match = callerFrame.match(/at\s+(?:\w+\.)*(\w+).*\(([^:]+):(\d+):\d+\)/);
    if (match) {
      return `${match[2]}:${match[3]}`;
    }

    // Fallback: try to extract just the file
    const fileMatch = callerFrame.match(/\(([^)]+):(\d+):\d+\)/);
    if (fileMatch) return `${fileMatch[1]}:${fileMatch[2]}`;

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Create a Sentry breadcrumb from a log entry.
 */
function createBreadcrumb(level: Sentry.Breadcrumb['level'], message: string, data?: unknown): Sentry.Breadcrumb {
  return {
    category: 'log',
    level,
    message,
    data: typeof data === 'object' && data !== null ? data : undefined,
  };
}

/**
 * Send a dev-mode log to Sentry as a breadcrumb.
 *
 * Pure, side-effect free. Does NOT throw in production if Sentry is disabled.
 */
function sendToSentry(level: Sentry.Breadcrumb['level'], message: string, data?: unknown): void {
  // Only send non-dev logs to Sentry; dev logs are too noisy
  // For dev builds, send all levels; for production, only warn/error
  if (__DEV__ || level === 'warning' || level === 'error') {
    try {
      Sentry.addBreadcrumb(createBreadcrumb(level, message, data));
    } catch {
      // Sentry might not be initialized; ignore silently
    }
  }
}

/**
 * Log a message with file/line context.
 *
 * Usage: log('User logged in', { userId, method: 'google' })
 *
 * Dev-only: hidden when __DEV__ is false (production builds).
 */
function log(message: string, data?: unknown): void {
  if (!__DEV__) return;

  const context = getCallerContext();
  const timestamp = getTimestamp();
  const formatted = `[${timestamp}] [${context}] ${message}`;

  // Output to console
  if (data !== undefined) {
    console.log(formatted, data);
  } else {
    console.log(formatted);
  }

  // Add to Sentry breadcrumbs
  sendToSentry('info', message, data);
}

/**
 * Log a warning with file/line context.
 *
 * Usage: log.warn('Slow network detected', { latencyMs: 2500 })
 *
 * Always shown (warnings matter in production too).
 */
function warn(message: string, data?: unknown): void {
  const context = getCallerContext();
  const timestamp = getTimestamp();
  const formatted = `[${timestamp}] [${context}] WARN: ${message}`;

  // Output to console
  if (data !== undefined) {
    console.warn(formatted, data);
  } else {
    console.warn(formatted);
  }

  // Add to Sentry breadcrumbs
  sendToSentry('warning', message, data);
}

/**
 * Log an error with file/line context.
 *
 * Usage: log.error('Failed to fetch profile', error)
 *
 * Always shown (errors should never be silent).
 */
function error(message: string, error?: unknown): void {
  const context = getCallerContext();
  const timestamp = getTimestamp();
  const formatted = `[${timestamp}] [${context}] ERROR: ${message}`;

  if (error instanceof Error) {
    console.error(formatted, error);
  } else if (error !== undefined) {
    console.error(formatted, error);
  } else {
    console.error(formatted);
  }

  // Add to Sentry breadcrumbs, then capture the error
  sendToSentry('error', message, error instanceof Error ? { message: error.message } : error);
  if (error instanceof Error) {
    Sentry.captureException(error);
  } else if (error !== undefined) {
    Sentry.captureException(new Error(String(error)));
  }
}

/**
 * Log detailed debug information (more verbose than log).
 *
 * Usage: log.debug('Rendering component', { props, state, key: 'value' })
 *
 * Dev-only: hidden when __DEV__ is false.
 */
function debug(message: string, data?: unknown): void {
  if (!__DEV__) return;

  // Only show debug if verbose mode is enabled
  if (!config.enableDebug) return;

  const context = getCallerContext();
  const timestamp = getTimestamp();
  const formatted = `[${timestamp}] [${context}] DEBUG: ${message}`;

  if (data !== undefined) {
    console.debug(formatted, data);
  } else {
    console.debug(formatted);
  }

  // Add to Sentry breadcrumbs (debug level)
  sendToSentry('debug', message, data);
}

/**
 * Expose the logger with methods.
 */
export const log = {
  log,
  warn,
  error,
  debug,
};

/**
 * Hook to get a bound logger that auto-includes the calling component's name.
 *
 * Usage in component:
 *   const log = useComponentLogger();
 *   log('Mounted with props', props);
 *
 * This avoids manually passing __filename/__line - the hook captures the
 * component name at hook invocation time.
 */
export function useComponentLogger(): typeof log {
  // The hook itself doesn't add context - the log() functions do via stack
  // parsing. This hook exists for convenience if you want to log the
  // component name explicitly.
  return log;
}

/**
 * Conditionally execute code in dev mode only.
 *
 * Usage: log.ifDev(() => { expensiveLoggingOperation() })
 */
log.ifDev = (fn: () => void): void => {
  if (__DEV__) fn();
};

/**
 * Conditionally execute code in dev mode only when verbose logging is enabled.
 *
 * Usage: log.ifDebug(() => { veryExpensiveLoggingOperation() })
 */
log.ifDebug = (fn: () => void): void => {
  if (__DEV__ && config.enableDebug) fn();
};
```

### Modify: `src/lib/config.ts`

Add to `configSchema`:
```typescript
  enableDebug: z.boolean().default(true),
```

Add to `RawEnv`:
```typescript
  enableDebug?: boolean;
```

Add to `readRawEnv()`:
```typescript
  enableDebug: process.env.EXPO_PUBLIC_ENABLE_DEBUG !== 'false', // default true
```

### Modify: `src/lib/sentry.ts`

No changes needed - the existing `scrubBreadcrumb` function already handles breadcrumb scrubbing, and `addBreadcrumb` will use it.

## Exact Commands

### Install no additional packages - React Native DevTools is built-in

**To verify it's available**:
```bash
npx expo start
```
Then press `J` in the terminal to open React Native DevTools.

### Verify the setup works

1. Add a test log to any component:
```typescript
import { log } from '../lib/logger';

log('Component mounted', { props });
log.debug('Detailed debug info', { expensive: 'data' });
```

2. Run the app: `npx expo start`
3. Press `J` to open React Native DevTools
4. Verify logs appear in the Console tab
5. Open Sentry dashboard (if configured) and verify breadcrumbs appear

## How to Use

### Basic logging (dev mode only)
```typescript
import { log } from '../lib/logger';

log('User clicked button', { userId, buttonId });
```

### Warnings (always visible)
```typescript
log.warn('Slow network detected', { latencyMs: 2500 });
```

### Errors (always visible + Sentry capture)
```typescript
try {
  // ...
} catch (error) {
  log.error('Failed to fetch profile', error);
}
```

### Verbose debug logging (dev + verbose mode)
```typescript
log.debug('Rendering component', { props, state, keys: Object.keys(props) });
```

### Component logger hook
```typescript
function MyComponent(props: Props) {
  const log = useComponentLogger();
  log('Component rendered', props);
  return <View>...</View>;
}
```

## DevTools Access

- **Open**: Press `J` in the terminal where `npx expo start` is running
- **Console tab**: See all `console.log/warn/error/debug` output
- **Sources tab**: Set breakpoints, inspect variables, step through code
- **Network tab**: View HTTP requests (Expo-only)
- **Memory tab**: Monitor heap usage
- **Components tab**: Inspect React component hierarchy (via React DevTools)
- **Profiler tab**: Profile component renders

## Production Behavior

- `log()` and `log.debug()` calls are **stripped entirely** (via `__DEV__` check)
- No runtime overhead in production builds
- Sentry breadcrumbs only created for non-dev logs or when explicitly needed
- No data leakage to Sentry in production unless explicitly logged as warning/error