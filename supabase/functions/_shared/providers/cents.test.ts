// Deno tests for the dollars -> integer cents boundary conversion.
// Run with: deno test supabase/functions/_shared/providers/
import { assertEquals, assertThrows } from 'jsr:@std/assert@^1';

import {
  CentsConversionError,
  dollarsToCents,
  optionalDollarsToCents,
  positiveDollarsToCents,
} from './cents.ts';

Deno.test('dollarsToCents converts common two-decimal prices exactly', () => {
  assertEquals(dollarsToCents(0), 0);
  assertEquals(dollarsToCents(1), 100);
  assertEquals(dollarsToCents(19.99), 1999);
  assertEquals(dollarsToCents(188.72), 18872);
  assertEquals(dollarsToCents(1000), 100000);
});

Deno.test('dollarsToCents absorbs binary float noise (19.99 * 100 case)', () => {
  // 19.99 * 100 === 1998.9999999999998 in IEEE-754; naive truncation would be
  // 1998. The conversion must still yield 1999.
  assertEquals(dollarsToCents(19.99), 1999);
});

Deno.test('dollarsToCents rounds the half-cent case up (1.005 -> 101)', () => {
  // 1.005 * 100 === 100.49999999999999; a naive Math.round would give 100.
  assertEquals(dollarsToCents(1.005), 101);
  assertEquals(dollarsToCents(2.675), 268);
});

Deno.test('dollarsToCents handles four-decimal provider values', () => {
  assertEquals(dollarsToCents(12.3456), 1235);
  assertEquals(dollarsToCents(0.9999), 100);
});

Deno.test('dollarsToCents rejects non-finite and negative values', () => {
  assertThrows(() => dollarsToCents(NaN), CentsConversionError);
  assertThrows(() => dollarsToCents(Infinity), CentsConversionError);
  assertThrows(() => dollarsToCents(-0.01), CentsConversionError);
  // deno-lint-ignore no-explicit-any
  assertThrows(() => dollarsToCents('5' as any), CentsConversionError);
});

Deno.test('positiveDollarsToCents rejects zero', () => {
  assertEquals(positiveDollarsToCents(0.01), 1);
  assertThrows(() => positiveDollarsToCents(0), CentsConversionError);
  assertThrows(() => positiveDollarsToCents(-1), CentsConversionError);
});

Deno.test('optionalDollarsToCents passes through null/undefined', () => {
  assertEquals(optionalDollarsToCents(undefined), undefined);
  assertEquals(optionalDollarsToCents(null), undefined);
  assertEquals(optionalDollarsToCents(5), 500);
  // A present-but-invalid value still throws (bad data is never dropped).
  assertThrows(() => optionalDollarsToCents(NaN), CentsConversionError);
});
