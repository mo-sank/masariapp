/**
 * Financial Glossary Data (Phase 2 - Requirement: Zero-Knowledge Onboarding & Glossary).
 *
 * Plain-language definitions, everyday analogies, and relatable examples
 * designed specifically for high schoolers and true beginners.
 */

export interface GlossaryEntry {
  id: string;
  term: string;
  pronunciation?: string;
  simpleDefinition: string;
  everydayAnalogy: string;
  example: string;
  category: 'basics' | 'trading' | 'metrics' | 'portfolio';
}

export const GLOSSARY_TERMS: Record<string, GlossaryEntry> = {
  stock: {
    id: 'stock',
    term: 'Stock (or Share)',
    simpleDefinition: 'A tiny fraction of ownership in a real company.',
    everydayAnalogy:
      'Imagine a large pizza cut into 1,000,000 microscopic slices. Buying 1 share is buying 1 slice. If the pizza becomes more delicious and famous, your slice is worth more.',
    example: 'When you buy 1 share of Apple, you legally own a tiny sliver of every iPhone, iPad, and retail store in the world.',
    category: 'basics',
  },
  market_cap: {
    id: 'market_cap',
    term: 'Market Cap (Market Capitalization)',
    simpleDefinition: 'The total price tag of an entire company.',
    everydayAnalogy:
      'If you wanted to buy every single slice of the pizza in existence, Market Cap is how much total cash you would need to hand the cashier.',
    example:
      'Calculated as: (Price of 1 share) × (Total shares in the world). A $20 stock could be a bigger company than a $200 stock if it has 50 times more shares!',
    category: 'metrics',
  },
  equity: {
    id: 'equity',
    term: 'Equity',
    simpleDefinition: 'The real dollar value that belongs to you after all debts are paid off.',
    everydayAnalogy:
      'If you buy a $1,000 electric scooter with $600 of your own cash and a $400 loan from a friend, your equity in that scooter is $600.',
    example:
      'In your portfolio, total equity is your cash plus the current live value of all the stocks you own.',
    category: 'portfolio',
  },
  dividend: {
    id: 'dividend',
    term: 'Dividend',
    simpleDefinition: 'A cash reward that profitable companies pay to their shareholders just for holding their stock.',
    everydayAnalogy:
      'Like a loyalty program or cash-back bonus from a business you co-own. Every 3 months, they split part of their extra profits and drop cash right into your account.',
    example:
      'If Coca-Cola pays a $0.50 dividend per share and you hold 10 shares, they pay you $5.00 in cash without you having to sell any stock.',
    category: 'basics',
  },
  pe_ratio: {
    id: 'pe_ratio',
    term: 'P/E Ratio (Price-to-Earnings)',
    simpleDefinition: 'A scoreboard that shows how expensive a stock is compared to how much actual profit the company earns.',
    everydayAnalogy:
      'Like comparing two lemonade stands: Stand A asks for $100 and makes $10/year profit (P/E of 10). Stand B asks for $100 but only makes $1/year (P/E of 100). Stand B is 10 times more expensive relative to its earnings!',
    example:
      'High P/E often means investors expect rapid future growth; low P/E might mean the company is mature or currently overlooked.',
    category: 'metrics',
  },
  volatility: {
    id: 'volatility',
    term: 'Volatility',
    simpleDefinition: 'How wildly and quickly a stock price swings up and down.',
    everydayAnalogy:
      'Think of a roller coaster versus a scenic train ride. A calm train ride has low volatility; a wild coaster with sharp drops has high volatility.',
    example:
      'Utility companies that provide tap water tend to have low volatility, while early-stage tech or biotech companies often have high volatility.',
    category: 'trading',
  },
  etf: {
    id: 'etf',
    term: 'ETF (Exchange-Traded Fund)',
    simpleDefinition: 'A bundle or basket of dozens (or hundreds) of stocks bought together in a single trade.',
    everydayAnalogy:
      'Instead of buying 1 bag of Skittles, 1 Hershey bar, and 1 pack of gum individually, an ETF is a pre-packaged snack box with a little bit of everything.',
    example:
      'The S&P 500 ETF holds shares in the 500 biggest public US companies. If one company stumbles, 499 others help balance it out.',
    category: 'portfolio',
  },
  diversification: {
    id: 'diversification',
    term: 'Diversification',
    simpleDefinition: 'Spreading your money across different companies and industries so a single bad day doesn’t wipe you out.',
    everydayAnalogy:
      'The classic rule: "Don’t put all your eggs in one basket." If you carry 10 eggs in 10 different small bags and drop one bag, you still have 9 eggs intact.',
    example:
      'Instead of putting 100% of your funds into one video game stock, holding a mix of tech, food, healthcare, and retail makes your portfolio far more resilient.',
    category: 'portfolio',
  },
  limit_order: {
    id: 'limit_order',
    term: 'Limit Order',
    simpleDefinition: 'An order to buy or sell a stock only at your chosen price (or better), never worse.',
    everydayAnalogy:
      'Like putting a bid on eBay: "I will only buy these sneakers if the price drops to $120 or lower. If they stay at $150, don’t buy."',
    example:
      'If Apple is trading at $180, you can set a limit buy at $175. The order only executes if the price dips to $175.',
    category: 'trading',
  },
  liquidity: {
    id: 'liquidity',
    term: 'Liquidity',
    simpleDefinition: 'How easily and quickly you can turn an asset into cash without moving the price.',
    everydayAnalogy:
      'Selling a popular pair of Nike Dunks online takes 10 minutes (high liquidity). Selling a rare antique piano might take 6 months to find a buyer (low liquidity).',
    example:
      'Large public stocks like Apple have ultra-high liquidity: millions of people are buying and selling every second.',
    category: 'trading',
  },
  paper_trading: {
    id: 'paper_trading',
    term: 'Paper Trading',
    simpleDefinition: 'Simulated trading using virtual play money with real-world market prices and live mechanics.',
    everydayAnalogy:
      'Flight simulators for pilots. You practice every takeoff, storm, and landing with zero risk of crashing a real plane.',
    example:
      'In Masari, you trade with a virtual starter stack of $10,000 paper cash. Zero real dollars are ever at risk.',
    category: 'basics',
  },
};

export function getGlossaryTerm(id: string): GlossaryEntry | undefined {
  return GLOSSARY_TERMS[id.toLowerCase().replace(/[-\s]/g, '_')];
}

export function listGlossaryTerms(): GlossaryEntry[] {
  return Object.values(GLOSSARY_TERMS);
}
