import { Screen, StateView } from '../../src/components/ui';

/**
 * Learn tab (requirements 7.1, 7.3).
 *
 * The home of the learning path. The lesson list and progression land in a
 * later spec, so for now this shows a consistent empty state rather than a blank
 * screen — the user sees the app is working and that lessons are coming.
 */
export default function LearnScreen() {
  return (
    <Screen>
      <StateView
        kind="empty"
        title="Lessons are on the way"
        message="Your learning path will appear here. Check back soon to start earning your first trading tools."
      />
    </Screen>
  );
}
