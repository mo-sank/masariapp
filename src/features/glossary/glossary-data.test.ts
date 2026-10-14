import { getGlossaryTerm, GLOSSARY_TERMS } from './glossary-data';

describe('glossary-data', () => {
  it('contains essential financial terms for zero-knowledge onboarding', () => {
    const essentialKeys = ['stock', 'market_cap', 'equity', 'dividend', 'volatility', 'diversification'];
    for (const key of essentialKeys) {
      expect(GLOSSARY_TERMS[key]).toBeDefined();
      expect(GLOSSARY_TERMS[key].simpleDefinition).toBeTruthy();
      expect(GLOSSARY_TERMS[key].everydayAnalogy).toBeTruthy();
    }
  });

  it('resolves terms case-insensitively with dashes or spaces', () => {
    expect(getGlossaryTerm('market-cap')?.id).toBe('market_cap');
    expect(getGlossaryTerm('Market Cap')?.id).toBe('market_cap');
    expect(getGlossaryTerm('STOCK')?.id).toBe('stock');
    expect(getGlossaryTerm('unknown_term')).toBeUndefined();
  });
});
