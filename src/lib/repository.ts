import { createClient } from '@supabase/supabase-js';
import {
  backupSchema,
  preferencesSchema,
  transactionSchema,
  type AppData,
  type Preferences,
  type Transaction,
} from './schema';
import { demoData, emptyData } from './defaults';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          flowType: 'pkce',
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;
export type StorageMode = 'demo' | 'local' | 'cloud';
const storageKey = (mode: StorageMode) => `spendpulse:v1:${mode}`;

const readLocal = (mode: StorageMode) => {
  const raw = localStorage.getItem(storageKey(mode));
  if (raw) return backupSchema.parse(JSON.parse(raw));
  const initial = mode === 'demo' ? demoData() : emptyData();
  localStorage.setItem(storageKey(mode), JSON.stringify(initial));
  return initial;
};
const writeLocal = (mode: StorageMode, data: AppData) => {
  localStorage.setItem(storageKey(mode), JSON.stringify(backupSchema.parse(data)));
};
const owner = async () => {
  if (!supabase) throw new Error('Configure Supabase first.');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Please sign in again.');
  return data.user.id;
};
export const loadData = async (mode: StorageMode): Promise<AppData> => {
  if (mode !== 'cloud') return readLocal(mode);
  const userId = await owner();
  const prefs = await supabase!
    .from('preferences')
    .select('data')
    .eq('owner_id', userId)
    .maybeSingle();
  if (prefs.error) throw prefs.error;
  const transactions: unknown[] = [];
  for (let offset = 0; ; offset += 1000) {
    const entries = await supabase!
      .from('transactions')
      .select('data')
      .eq('owner_id', userId)
      .order('id')
      .range(offset, offset + 999);
    if (entries.error) throw entries.error;
    transactions.push(...entries.data.map((row) => row.data));
    if (entries.data.length < 1000) break;
  }
  if (!prefs.data) await savePreferences(mode, emptyData().preferences);
  return backupSchema.parse({
    version: 1,
    transactions,
    preferences: prefs.data?.data ?? emptyData().preferences,
  });
};
export const saveTransaction = async (mode: StorageMode, input: Transaction) => {
  const transaction = transactionSchema.parse(input);
  if (mode !== 'cloud') {
    const data = readLocal(mode);
    if (
      transaction.kind !== 'expense' &&
      data.transactions.some((entry) => entry.linkedTransactionId === transaction.id)
    )
      throw new Error(
        'Unlink refunds and reimbursements before changing the original expense type.',
      );
    const existing = data.transactions.findIndex((entry) => entry.id === transaction.id);
    if (
      transaction.sourceKey &&
      data.transactions.some(
        (entry) => entry.id !== transaction.id && entry.sourceKey === transaction.sourceKey,
      )
    )
      throw new Error('This source was already imported.');
    if (existing >= 0) data.transactions[existing] = transaction;
    else data.transactions.push(transaction);
    writeLocal(mode, data);
    return;
  }
  const ownerId = await owner();
  const { error } = await supabase!.from('transactions').upsert({
    id: transaction.id,
    owner_id: ownerId,
    data: transaction,
    source_key: transaction.sourceKey,
  });
  if (error) throw error;
};
export const deleteTransaction = async (mode: StorageMode, id: string) => {
  const data = await loadData(mode);
  if (data.transactions.some((entry) => entry.linkedTransactionId === id))
    throw new Error('Unlink refunds or reimbursements before deleting this expense.');
  if (mode !== 'cloud') {
    data.transactions = data.transactions.filter((entry) => entry.id !== id);
    writeLocal(mode, data);
    return;
  }
  const { error } = await supabase!
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('owner_id', await owner());
  if (error) throw error;
};
export const savePreferences = async (mode: StorageMode, input: Preferences) => {
  const preferences = preferencesSchema.parse(input);
  if (mode !== 'cloud') {
    const data = readLocal(mode);
    data.preferences = preferences;
    writeLocal(mode, data);
    return;
  }
  const { error } = await supabase!
    .from('preferences')
    .upsert({ owner_id: await owner(), data: preferences });
  if (error) throw error;
};
export const saveImport = async (mode: StorageMode, input: Transaction[]) => {
  const transactions = input.map((entry) => transactionSchema.parse(entry));
  if (mode !== 'cloud') {
    const data = readLocal(mode);
    const keys = new Set(data.transactions.map((entry) => entry.sourceKey).filter(Boolean));
    const ids = new Set(data.transactions.map((entry) => entry.id));
    for (const entry of transactions) {
      if (ids.has(entry.id) || (entry.sourceKey && keys.has(entry.sourceKey))) continue;
      data.transactions.push(entry);
      ids.add(entry.id);
      if (entry.sourceKey) keys.add(entry.sourceKey);
    }
    writeLocal(mode, data);
    return;
  }
  const ownerId = await owner();
  const { error } = await supabase!.rpc('import_transactions', {
    records: transactions.map((entry) => ({
      id: entry.id,
      owner_id: ownerId,
      data: entry,
      source_key: entry.sourceKey,
    })),
  });
  if (error) throw error;
};
export const undoImport = async (mode: StorageMode, importId: string) => {
  const data = await loadData(mode);
  const ids = new Set(
    data.transactions.filter((entry) => entry.importId === importId).map((entry) => entry.id),
  );
  if (
    data.transactions.some(
      (entry) =>
        entry.linkedTransactionId && ids.has(entry.linkedTransactionId) && !ids.has(entry.id),
    )
  )
    throw new Error('Unlink dependent refunds or reimbursements before undoing this import.');
  if (mode !== 'cloud') {
    data.transactions = data.transactions.filter((entry) => !ids.has(entry.id));
    writeLocal(mode, data);
    return;
  }
  const { error } = await supabase!.rpc('undo_import', { import_id: importId });
  if (error) throw error;
};
export const callIntegration = async (action: string, payload: Record<string, unknown> = {}) => {
  if (!supabase) throw new Error('Set up Supabase using the Backend connection guide in Settings.');
  const { data, error } = await supabase.functions.invoke('integrations', {
    body: { action, ...payload },
  });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
};
export const downloadText = (name: string, content: string, type = 'application/json') => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
