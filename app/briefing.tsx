import { Disclaimer, Screen, StateView, Text } from '../src/components/ui';
import { BriefingCards } from '../src/features/briefing/components';
import { useBriefing } from '../src/features/briefing/use-briefing';
import { Gate } from '../src/features/progress/components/Gate';
import { useSession } from '../src/lib/auth0';
import { useTheme } from '../src/theme/theme-provider';

/**
 * Daily Market Briefing screen (requirements 4.1-4.4).
 *
 * The three-card recap opened from the Learn tab's {@link BriefingCard}: card 1
 * shows the top gainer and top loser among starter stocks, card 2 the learner's
 * portfolio day change, and card 3 a short "why prices move" tip from the
 * reviewed template list (requirement 4.2). When the market is closed the cards
 * use the last close and say so (requirement 4.3). Everything comes from the
 * `get_daily_briefing` RPC via {@link useBriefing} — no AI text, no
 * recommendations (requirement 4.4).
 *
 * The screen is gated on the `daily_briefing` feature through the shared
 * {@link Gate} (progression spec requirements 1.3, 1.5): until the learner earns
 * it (completing boss B1) it shows a {@link LockedState} naming that lesson with
 * a button that opens it, rather than a dead end. The gate fails closed — while
 * unlocks load it shows a loading placeholder, and if the unlocks query errors it
 * shows a retry — so the briefing never flashes before the gate resolves. The
 * server re-enforces the same unlock (requirement 1.4), so the data fetch is
 * safe even if the gate were bypassed.
 *
 * This route stays thin: it owns gating and loading/empty/error states; the card
 * layout and integer-cents formatting live in {@link BriefingCards}.
 */
export default function BriefingScreen() {
  const { isSignedIn } = useSession();

  return (
    <Gate feature="daily_briefing" isSignedIn={isSignedIn} loadingFallback={<BriefingLoading />}>
      <BriefingView isSignedIn={isSignedIn} />
    </Gate>
  );
}

/** Full-screen loading placeholder shown while the unlock check resolves. */
function BriefingLoading() {
  return (
    <Screen>
      <StateView kind="loading" />
    </Screen>
  );
}

/** The unlocked briefing UI, split out so the query runs only once gated in. */
function BriefingView({ isSignedIn }: { isSignedIn: boolean }) {
  const theme = useTheme();
  const briefing = useBriefing(isSignedIn);

  if (briefing.isLoading) {
    return (
      <Screen>
        <StateView kind="loading" />
      </Screen>
    );
  }

  if (briefing.isError || !briefing.data) {
    return (
      <Screen>
        <StateView
          kind="error"
          message="We couldn't load your briefing. Please try again."
          onRetry={briefing.refetch}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll style={{ gap: theme.spacing.lg }}>
      <Text variant="title" accessibilityRole="header">
        Daily Market Briefing
      </Text>
      <BriefingCards briefing={briefing.data} />
      <Disclaimer />
    </Screen>
  );
}
