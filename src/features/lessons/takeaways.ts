/**
 * Lesson Takeaway Cards (Phase 2 - Item 2.3: Remediation & End-of-Lesson Summary Cards).
 *
 * Provides persistent, bite-sized key takeaways and teen analogies for every lesson.
 * Displayed:
 * 1. At the conclusion of a lesson in CompletionResults.
 * 2. In the "Knowledge Binder" on the Profile tab for anytime review.
 */

export interface LessonTakeaway {
  lessonId: string;
  title: string;
  unit: number;
  emoji: string;
  tagline: string;
  bullets: string[];
  teenAnalogy: string;
}

export const LESSON_TAKEAWAYS: Record<string, LessonTakeaway> = {
  'L1.1': {
    lessonId: 'L1.1',
    title: 'Slice the Pizza',
    unit: 1,
    emoji: '🍕',
    tagline: 'Owning a share means owning a slice of a real business.',
    bullets: [
      'A share represents fractional ownership of the entire company.',
      'Companies issue shares to raise money for growth, research, and new gear.',
      'When the business grows in value, your slice grows in value with it.',
    ],
    teenAnalogy: 'Think of 1 share like owning 1 slice of an 8-slice pizza. If the pizza gets bigger or tastier, your slice is worth more.',
  },
  'L1.2': {
    lessonId: 'L1.2',
    title: 'The Auction Room',
    unit: 1,
    emoji: '🏷️',
    tagline: 'Prices move based on the tug-of-war between buyers and sellers.',
    bullets: [
      'Bid is the highest price a buyer is willing to pay.',
      'Ask is the lowest price a seller is willing to accept.',
      'Prices climb when eager buyers outnumber sellers, and drop when sellers outnumber buyers.',
    ],
    teenAnalogy: 'Like concert tickets on Ticketmaster or a hyped sneaker drop: when everyone wants in, prices surge; when hype dies down, prices fall.',
  },
  'L1.3': {
    lessonId: 'L1.3',
    title: 'Anatomy of a Stock Card',
    unit: 1,
    emoji: '📊',
    tagline: 'Read stock data like a sports stat sheet.',
    bullets: [
      'The Ticker (like AAPL or TSLA) is a company’s universal trading nickname.',
      'Daily change shows how far the price moved compared to yesterday’s final bell.',
      'Trading Volume measures how many total shares switched hands today.',
    ],
    teenAnalogy: 'Just like reading points, assists, and shooting percentage on a basketball box score, stock cards give you the vital stats at a glance.',
  },
  'L1.4': {
    lessonId: 'L1.4',
    title: 'Your First Trade',
    unit: 1,
    emoji: '⚡',
    tagline: 'Market orders fill immediately at current market prices.',
    bullets: [
      'A Market Order prioritizes speed: it executes right now at the best available price.',
      'Never invest money you need for next week’s expenses.',
      'Once filled, shares sit in your paper portfolio ready to track.',
    ],
    teenAnalogy: 'Like ordering fast food drive-thru: you get your order instantly right now at the menu price.',
  },
  'L1.5': {
    lessonId: 'L1.5',
    title: 'Win, Lose, or Hold',
    unit: 1,
    emoji: '💼',
    tagline: 'Paper gains are not real cash until you hit Sell.',
    bullets: [
      'Unrealized P&L is what your open positions are worth on paper today.',
      'Realized P&L happens only after you sell your shares for cash.',
      'Prices fluctuate every second — don’t panic over normal daily wiggles.',
    ],
    teenAnalogy: 'If a rare trading card in your binder jumps to $100, you don’t have $100 cash in your pocket until you actually find a buyer and sell it.',
  },
  'B1': {
    lessonId: 'B1',
    title: 'Opening Bell Boss',
    unit: 1,
    emoji: '🔔',
    tagline: 'Synthesizing market mechanics in real time.',
    bullets: [
      'Market headlines cause rapid psychological shifts among market participants.',
      'Earnings surprises drive sudden gap ups or gap downs.',
      'Disciplined traders stay calm and check facts before reacting to wild rumors.',
    ],
    teenAnalogy: 'Like reacting to breaking trade rumors on social media: verify the official news before jumping to conclusions.',
  },
  'L2.1': {
    lessonId: 'L2.1',
    title: 'Charts Tell Stories',
    unit: 2,
    emoji: '📈',
    tagline: 'Zoom out: day-to-day noise fades when looking at multi-year trends.',
    bullets: [
      '1-day charts exaggerate tiny moves; 1-year and 5-year charts show real long-term trends.',
      'Steady upward trends reflect sustained earnings and business growth.',
      'Choppy horizontal charts show a balanced tug-of-war between bulls and bears.',
    ],
    teenAnalogy: 'If you zoom into one bad test grade, it looks tragic. Zoom out to the whole school year, and your overall GPA is still great. Always zoom out!',
  },
};

export function getTakeaway(lessonId: string): LessonTakeaway | undefined {
  return LESSON_TAKEAWAYS[lessonId];
}

export function listTakeaways(): LessonTakeaway[] {
  return Object.values(LESSON_TAKEAWAYS);
}
