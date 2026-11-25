import { describe, expect, it } from 'vitest';
import {
  categoryTotals,
  duplicateOf,
  monthSummary,
  outstanding,
  personalSpend,
  rupees,
  shiftMonth,
  toPaise,
  suggestReimbursements,
} from '../../src/lib/finance';
import { emptyData } from '../../src/lib/defaults';
import { transactionSchema, type Transaction } from '../../src/lib/schema';

const entry = (patch: Partial<Transaction> = {}): Transaction =>
  transactionSchema.parse({
    id: crypto.randomUUID(),
    date: '2026-11-10',
    merchant: 'Dinner',
    amountPaise: 300000,
    personalSharePaise: 100000,
    settledPaise: 0,
    kind: 'expense',
    categoryId: 'food',
    accountId: 'cash',
    source: 'manual',
    sourceKey: null,
    importId: null,
    notes: '',
    excluded: false,
    linkedTransactionId: null,
    createdAt: '2026-11-10T12:00:00Z',
    ...patch,
  });
describe('financial invariants', () => {
  it('suggests matching credits without mutating expenses or including salary', () => {
    const bill = entry();
    const credit = entry({
      kind: 'income',
      categoryId: 'other-income',
      amountPaise: 200000,
      personalSharePaise: 200000,
      date: '2026-11-12',
    });
    const matches = suggestReimbursements([bill, credit]);
    expect(matches).toHaveLength(1);
    expect(matches[0].needsShare).toBe(false);
    expect(bill.personalSharePaise).toBe(100000);
    expect(suggestReimbursements([bill, { ...credit, categoryId: 'salary' }])).toHaveLength(0);
    expect(suggestReimbursements([bill, { ...credit, date: '2026-12-12' }])).toHaveLength(0);
  });
  it('parses INR exactly, rejecting precision and invalid amounts', () => {
    expect(toPaise('₹1,23,456.78')).toBe(12345678);
    expect(toPaise('0.29')).toBe(29);
    expect(toPaise('-2')).toBeNaN();
    expect(toPaise('1.005')).toBeNaN();
    expect(rupees(12345600)).toContain('1,23,456');
  });
  it('counts income separately from transfers and reimbursements', () => {
    const bill = entry();
    const refund = entry({
      kind: 'reimbursement',
      linkedTransactionId: bill.id,
      amountPaise: 50000,
      personalSharePaise: 50000,
    });
    const data = emptyData();
    data.transactions = [
      bill,
      refund,
      entry({ kind: 'income', amountPaise: 1000000, personalSharePaise: 1000000 }),
      entry({ kind: 'transfer' }),
    ];
    const result = monthSummary(data, '2026-11');
    expect(result.spend).toBe(100000);
    expect(result.income).toBe(1000000);
    expect(result.savings).toBe(900000);
    expect(result.owed).toBe(150000);
  });
  it('never deducts a repayment twice from personal spend', () => {
    const bill = entry({ settledPaise: 100000 });
    const credit = entry({
      kind: 'reimbursement',
      amountPaise: 100000,
      personalSharePaise: 100000,
      linkedTransactionId: bill.id,
    });
    expect(outstanding(bill, [bill, credit])).toBe(0);
    expect(personalSpend(bill, [bill, credit])).toBe(100000);
    expect(personalSpend(credit, [bill, credit])).toBe(0);
  });
  it('allocates cumulative partial refunds and caps at the original personal share', () => {
    const bill = entry({ amountPaise: 10000, personalSharePaise: 3333 });
    const refunds = [
      entry({
        kind: 'refund',
        date: '2026-11-11',
        amountPaise: 5000,
        personalSharePaise: 5000,
        linkedTransactionId: bill.id,
      }),
      entry({
        kind: 'refund',
        date: '2026-12-01',
        amountPaise: 8000,
        personalSharePaise: 8000,
        linkedTransactionId: bill.id,
      }),
    ];
    const all = [bill, ...refunds];
    expect(all.reduce((sum, item) => sum + personalSpend(item, all), 0)).toBe(0);
    const data = emptyData();
    data.transactions = all;
    expect(monthSummary(data, '2026-12').spend).toBe(-1666);
    expect(categoryTotals(refunds, all).food).toBe(-3333);
  });
  it('ignores excluded expenses and their refunds', () => {
    const bill = entry({ excluded: true });
    const refund = entry({ kind: 'refund', linkedTransactionId: bill.id });
    expect(personalSpend(bill, [bill, refund])).toBe(0);
    expect(personalSpend(refund, [bill, refund])).toBe(0);
  });
  it('requires review for unlinked refunds', () =>
    expect(personalSpend(entry({ kind: 'refund' }), [])).toBe(0));
  it('rejects impossible dates, shares, and settlements', () => {
    expect(transactionSchema.safeParse({ ...entry(), date: '2026-02-30' }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...entry(), personalSharePaise: 300001 }).success).toBe(
      false,
    );
    expect(transactionSchema.safeParse({ ...entry(), settledPaise: 200001 }).success).toBe(false);
  });
  it('distinguishes exact-source duplicates and possible cross-source duplicates', () => {
    const bill = entry({ sourceKey: 'gmail:one' });
    expect(duplicateOf(bill, [bill])?.exact).toBe(true);
    expect(duplicateOf({ ...bill, sourceKey: 'receipt:two' }, [bill])?.exact).toBe(false);
    expect(duplicateOf({ ...bill, sourceKey: null, date: '2026-11-11' }, [bill])).toBeNull();
  });
  it('handles year boundaries', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});
