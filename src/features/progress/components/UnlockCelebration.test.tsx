import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UnlockCelebration } from './UnlockCelebration';
import { ThemeProvider } from '../../../theme/theme-provider';
import { featureDescription } from '../feature-descriptions';

/**
 * Render under the theme provider.
 *
 * Behavioural assertions (copy, descriptions, deep links, filtering) run with
 * `reduceMotion` so no entrance-animation timer is scheduled — the static
 * variant renders the same text and the same "Try it now" links as the animated
 * one (requirement 2.3), which keeps these tests free of animation timing and
 * deterministic. The animated path has its own focused test below.
 */
async function renderStatic(ui: ReactElement) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
}

// Press within an awaited act so the triggered update is flushed before we
// assert, and never leaks into a later test (mirrors the Toast test's helper;
// render is async in this RNTL version).
async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
}

describe('<UnlockCelebration /> (2.1, 2.2, 2.3)', () => {
  it('shows an entry per feature with its name and description (2.1)', async () => {
    await renderStatic(
      <UnlockCelebration unlocked={['explore', 'watchlist']} onTryFeature={jest.fn()} reduceMotion />,
    );

    expect(screen.getByText('You unlocked')).toBeTruthy();
    expect(screen.getByText('🎉 Explore unlocked')).toBeTruthy();
    expect(screen.getByText('🎉 Watchlist unlocked')).toBeTruthy();
    // The short "what it does" description accompanies each unlock (2.1).
    expect(screen.getByText(featureDescription('explore'))).toBeTruthy();
    expect(screen.getByText(featureDescription('watchlist'))).toBeTruthy();
  });

  it('deep-links to the unlocked feature when "Try it now" is pressed (2.2)', async () => {
    const onTryFeature = jest.fn();
    await renderStatic(
      <UnlockCelebration unlocked={['portfolio']} onTryFeature={onTryFeature} reduceMotion />,
    );

    await press(screen.getByRole('button', { name: 'Try Portfolio now' }));
    expect(onTryFeature).toHaveBeenCalledWith('/(tabs)/portfolio');
  });

  it('routes watchlist and trade history to their screens (2.2)', async () => {
    const onTryFeature = jest.fn();
    await renderStatic(
      <UnlockCelebration
        unlocked={['watchlist', 'trade_history']}
        onTryFeature={onTryFeature}
        reduceMotion
      />,
    );

    await press(screen.getByRole('button', { name: 'Try Watchlist now' }));
    expect(onTryFeature).toHaveBeenCalledWith('/(tabs)/explore');

    await press(screen.getByRole('button', { name: 'Try Trade history now' }));
    expect(onTryFeature).toHaveBeenCalledWith('/history');
  });

  it('omits the "Try it now" button for a per-symbol feature with no landing route (2.2)', async () => {
    await renderStatic(
      <UnlockCelebration unlocked={['stock_detail']} onTryFeature={jest.fn()} reduceMotion />,
    );

    // The unlock is still celebrated by name, just without a navigation button.
    expect(screen.getByText('🎉 Stock detail unlocked')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Try / })).toBeNull();
  });

  it('ignores unknown feature keys and renders nothing when there is nothing to show', async () => {
    await renderStatic(
      <UnlockCelebration unlocked={['mystery_key']} onTryFeature={jest.fn()} reduceMotion />,
    );

    // The celebration renders nothing: no header, no cards, no "Try it now".
    expect(screen.queryByText('You unlocked')).toBeNull();
    expect(screen.queryByText(/unlocked$/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  // With motion allowed the component mounts the same cards (the entrance
  // animation is a visual enhancement layered over the same tree) and still
  // exposes the copy and deep links. `findBy*` lets the mount's async act settle
  // before asserting so the running animation does not race the query.
  it('renders the same copy and links with motion allowed (2.1)', async () => {
    const onTryFeature = jest.fn();
    await renderStatic(
      <UnlockCelebration
        unlocked={['explore']}
        onTryFeature={onTryFeature}
        reduceMotion={false}
      />,
    );

    expect(await screen.findByText('🎉 Explore unlocked')).toBeTruthy();
    expect(screen.getByText(featureDescription('explore'))).toBeTruthy();
    await press(screen.getByRole('button', { name: 'Try Explore now' }));
    expect(onTryFeature).toHaveBeenCalledWith('/(tabs)/explore');
  });
});
