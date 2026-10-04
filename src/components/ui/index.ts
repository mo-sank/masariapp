/**
 * Shared UI kit barrel (requirement 7.4).
 *
 * One import point for the themed presentational components so screens can pull
 * what they need from `src/components/ui` without reaching into individual
 * files.
 */
export { Button, type ButtonProps, type ButtonVariant } from './button';
export { Card, type CardProps } from './card';
export { ErrorBoundary, type ErrorBoundaryProps } from './error-boundary';
export { LockedState, type LockedStateProps } from './locked-state';
export { Screen, type ScreenProps } from './screen';
export { StateView, type StateKind, type StateViewProps } from './state-view';
export { Text, type TextProps } from './text';
export { ToastProvider, useToast, type ToastApi, type ToastOptions, type ToastTone } from './toast';
