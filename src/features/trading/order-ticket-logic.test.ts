import {
  RATIONALE_CHIPS,
  RATIONALE_NOTE_MAX,
  canSubmitOrder,
  estimateTotalCents,
  isRationaleComplete,
} from './order-ticket-logic';

describe('estimateTotalCents (8.1 estimate math)', () => {
  it('multiplies whole shares by the price in cents', () => {
    expect(estimateTotalCents(3, 15000)).toBe(45000); // 3 × $150.00 = $450.00
  });

  it('is exact integer math (no float drift)', () => {
    expect(estimateTotalCents(7, 1033)).toBe(7231); // 7 × $10.33 = $72.31
  });

  it('rounds a fractional quantity to whole shares before multiplying', () => {
    expect(estimateTotalCents(2.9, 1000)).toBe(3000);
  });

  it('returns 0 when there is no quote yet', () => {
    expect(estimateTotalCents(5, null)).toBe(0);
    expect(estimateTotalCents(5, undefined)).toBe(0);
  });

  it('returns 0 for a quantity below one share', () => {
    expect(estimateTotalCents(0, 1000)).toBe(0);
    expect(estimateTotalCents(-3, 1000)).toBe(0);
  });

  it('returns 0 for a non-finite price', () => {
    expect(estimateTotalCents(5, Number.NaN)).toBe(0);
  });
});

describe('isRationaleComplete (9.1)', () => {
  it('requires at least one chip', () => {
    expect(isRationaleComplete([], '')).toBe(false);
    expect(isRationaleComplete(['know_the_brand'], '')).toBe(true);
  });

  it('allows an optional note up to the 280-char limit', () => {
    const note = 'a'.repeat(RATIONALE_NOTE_MAX);
    expect(isRationaleComplete(['growing_company'], note)).toBe(true);
  });

  it('rejects a note over the 280-char limit', () => {
    const tooLong = 'a'.repeat(RATIONALE_NOTE_MAX + 1);
    expect(isRationaleComplete(['growing_company'], tooLong)).toBe(false);
  });

  it('exposes a fixed set of reason chips with stable ids', () => {
    expect(RATIONALE_CHIPS.length).toBeGreaterThanOrEqual(1);
    for (const chip of RATIONALE_CHIPS) {
      expect(typeof chip.id).toBe('string');
      expect(chip.id.length).toBeGreaterThan(0);
      expect(typeof chip.label).toBe('string');
    }
  });
});

describe('canSubmitOrder (9.1 gating + submit guard)', () => {
  const base = {
    qty: 1,
    pending: false,
    rationaleRequired: false,
    selectedTags: [] as string[],
    note: '',
  };

  it('allows a valid non-rationale order', () => {
    expect(canSubmitOrder(base)).toBe(true);
  });

  it('blocks submit while an order is pending', () => {
    expect(canSubmitOrder({ ...base, pending: true })).toBe(false);
  });

  it('blocks a quantity below one share', () => {
    expect(canSubmitOrder({ ...base, qty: 0 })).toBe(false);
  });

  it('blocks a fractional quantity', () => {
    expect(canSubmitOrder({ ...base, qty: 2.5 })).toBe(false);
  });

  it('requires a rationale chip when rationale is required (9.1)', () => {
    expect(canSubmitOrder({ ...base, rationaleRequired: true, selectedTags: [] })).toBe(false);
    expect(
      canSubmitOrder({ ...base, rationaleRequired: true, selectedTags: ['just_exploring'] }),
    ).toBe(true);
  });

  it('blocks a rationale order whose note is too long (9.1)', () => {
    expect(
      canSubmitOrder({
        ...base,
        rationaleRequired: true,
        selectedTags: ['just_exploring'],
        note: 'a'.repeat(RATIONALE_NOTE_MAX + 1),
      }),
    ).toBe(false);
  });
});
