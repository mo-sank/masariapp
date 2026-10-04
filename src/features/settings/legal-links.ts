/**
 * Legal links (requirement 8.1).
 *
 * Settings shows a Privacy Policy and Terms link. The URLs come from the
 * validated config (placeholders in development, the hosted documents in
 * production — see src/lib/config.ts). Opening a link uses expo-web-browser's
 * in-app system browser (SFSafariViewController on iOS, Chrome Custom Tabs on
 * Android) so the user stays in the app's context rather than being thrown out
 * to a separate browser app.
 *
 * `openUrl` swallows the browser result and only rethrows a genuine failure to
 * open, so the caller can show a message without needing to parse the
 * cancel/dismiss outcomes a user triggers by closing the browser themselves.
 */
import * as WebBrowser from 'expo-web-browser';

import { config } from '../../lib/config';

/** A single legal document link shown in Settings. */
export interface LegalLink {
  /** Stable key for list rendering and testing. */
  key: 'privacy' | 'terms';
  /** User-facing label. */
  label: string;
  /** The URL to open. */
  url: string;
}

/** The legal links to render, in display order. */
export function legalLinks(): LegalLink[] {
  return [
    { key: 'privacy', label: 'Privacy Policy', url: config.legalPrivacyUrl },
    { key: 'terms', label: 'Terms', url: config.legalTermsUrl },
  ];
}

/**
 * Open a legal URL in the in-app system browser. Resolves once the browser is
 * presented (or immediately after the user closes it). Rethrows only if the
 * browser could not be opened at all.
 */
export async function openUrl(url: string): Promise<void> {
  await WebBrowser.openBrowserAsync(url);
}
