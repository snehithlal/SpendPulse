import { describe, expect, it } from 'vitest';
import { defaultPreferences } from '../../src/lib/defaults';
import { parseEntry, parseReceipt } from '../../src/lib/parser';
import { guessMapping, mapStatementRows, normalizeDate } from '../../src/lib/documents';

describe('rule-based entry', () => {
  it('extracts Indian English without AI', () => {
    const value = parseEntry(
      'Spent ₹350 on Swiggy yesterday using cash',
      defaultPreferences,
      '2026-11-25',
    );
    expect(value).toMatchObject({
      amountPaise: 35000,
      merchant: 'Swiggy',
      categoryId: 'food',
      date: '2026-11-24',
      accountId: 'cash',
      kind: 'expense',
    });
  });
  it('extracts common Manglish', () =>
    expect(
      parseEntry('Innale Swiggy-il 350 rupees spend cheythu', defaultPreferences, '2026-11-25'),
    ).toMatchObject({ amountPaise: 35000, merchant: 'Swiggy', date: '2026-11-24' }));
  it('recognizes income', () =>
    expect(parseEntry('Salary received INR 2,50,000', defaultPreferences)).toMatchObject({
      amountPaise: 25000000,
      kind: 'income',
      categoryId: 'salary',
    }));
  it('leaves multiple unexplained numbers unresolved', () =>
    expect(parseEntry('Dinner 500 300', defaultPreferences).amountPaise).toBeUndefined());
  it('uses final total, not subtotal', () =>
    expect(
      parseReceipt(
        'CAFE\n25/11/2026\nSubtotal 100.00\nTax 5.00\nGrand total 105.00',
        defaultPreferences,
      ),
    ).toMatchObject({ amountPaise: 10500, date: '2026-11-25' }));
  it('flags conflicting receipt totals', () =>
    expect(
      parseReceipt('CAFE\nTotal 105.00\nAmount payable 110.00', defaultPreferences).amountPaise,
    ).toBeUndefined());
  it('does not silently supply a missing receipt date', () =>
    expect(parseReceipt('CAFE\nGrand total 105.00', defaultPreferences).date).toBeUndefined());
});
describe('statement mappings', () => {
  it('supports Indian and ISO date formats', () => {
    expect(normalizeDate('25/11/2026')).toBe('2026-11-25');
    expect(normalizeDate('25-Nov-2026')).toBe('2026-11-25');
    expect(normalizeDate('2026-11-25')).toBe('2026-11-25');
    expect(normalizeDate('bad')).toBeUndefined();
  });
  it('maps separate debit and credit columns', () => {
    const headers = ['Date', 'Narration', 'Debit', 'Credit'];
    const mapping = guessMapping(headers);
    const rows = mapStatementRows(
      [
        ['25/11/2026', 'Swiggy', '350.50', ''],
        ['26/11/2026', 'Salary', '', '250000'],
      ],
      mapping,
    );
    expect(rows[0]).toMatchObject({ amountPaise: 35050, kind: 'expense' });
    expect(rows[1]).toMatchObject({ amountPaise: 25000000, kind: 'income' });
  });
  it('keeps invalid amounts for review', () => {
    const rows = mapStatementRows(
      [['25/11/2026', 'Broken entry', 'unknown']],
      guessMapping(['Date', 'Description', 'Amount']),
    );
    expect(rows[0].amountPaise).toBeUndefined();
  });
});
