import { marketBannerLabel } from './market-banner';

describe('marketBannerLabel', () => {
  it('labels an open market', () => {
    expect(marketBannerLabel('open')).toBe('Market open');
  });

  it('labels an after-hours close', () => {
    expect(marketBannerLabel('closed_after_hours')).toBe('Market closed · After hours');
  });

  it('names the holiday on a holiday close', () => {
    expect(marketBannerLabel('closed_holiday', 'Thanksgiving Day')).toBe(
      'Market closed · Thanksgiving Day',
    );
  });

  it('falls back to a generic holiday label when the name is missing', () => {
    expect(marketBannerLabel('closed_holiday', null)).toBe('Market closed · Holiday');
  });
});
