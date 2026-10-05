import { router, useLocalSearchParams } from 'expo-router';

import { OrderTicket } from '../../src/features/trading/components';
import { useSession } from '../../src/lib/auth0';

/**
 * Order-ticket modal route (requirements 8.1, 8.4, 8.5, 8.6, 8.7, 9.1).
 *
 * Reached from the stock detail page's Trade button. This route stays thin: it
 * resolves the `symbol` route param and the session, then hands off to
 * {@link OrderTicket}, which owns the whole order flow (side toggle, quantity,
 * estimate, rationale, idempotent submit, confirmation, and error mapping). All
 * trading rules and the fill price are decided server-side by
 * `place_market_order` — the client never sends a price.
 *
 * Dismissing a filled order (or an un-tradeable, locked ticket) routes back to
 * the previous screen.
 */
export default function TradeScreen() {
  const { symbol: rawSymbol } = useLocalSearchParams<{ symbol: string }>();
  const symbol = (rawSymbol ?? '').toUpperCase();
  const { isSignedIn } = useSession();

  return (
    <OrderTicket
      symbol={symbol}
      isSignedIn={isSignedIn}
      onClose={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/explore'))}
    />
  );
}
