import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { loadData, saveImport, saveTransaction, undoImport } from '../../src/lib/repository';
import { transactionSchema } from '../../src/lib/schema';

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
const entry = () =>
  transactionSchema.parse({
    id: crypto.randomUUID(),
    date: '2026-11-25',
    merchant: 'Local fixture',
    amountPaise: 10000,
    personalSharePaise: 10000,
    kind: 'expense',
    categoryId: 'food',
    accountId: 'cash',
    source: 'manual',
    notes: '',
    excluded: false,
    importId: null,
    createdAt: new Date().toISOString(),
  });
describe('local persistence', () => {
  it('isolates demo and local ledgers', async () => {
    expect((await loadData('demo')).transactions.length).toBeGreaterThan(0);
    expect((await loadData('local')).transactions).toEqual([]);
  });
  it('preserves entries across reads and edits instead of duplicating', async () => {
    const transaction = entry();
    await saveTransaction('local', transaction);
    await saveTransaction('local', { ...transaction, merchant: 'Updated' });
    const data = await loadData('local');
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0].merchant).toBe('Updated');
  });
  it('merges a backup idempotently even without source keys', async () => {
    const transaction = entry();
    await saveImport('local', [transaction]);
    await saveImport('local', [transaction]);
    expect((await loadData('local')).transactions).toHaveLength(1);
  });
  it('undo removes only entries created by a batch', async () => {
    const existing = entry();
    await saveTransaction('local', existing);
    await saveImport('local', [{ ...entry(), importId: 'test-import' }]);
    await undoImport('local', 'test-import');
    expect((await loadData('local')).transactions.map((transaction) => transaction.id)).toEqual([
      existing.id,
    ]);
  });
});
