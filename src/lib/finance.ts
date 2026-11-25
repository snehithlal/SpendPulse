import type { AppData, Preferences, Transaction } from './schema';

export const today = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};
export const rupees = (paise: number, decimals = false) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(paise / 100);
};
export const toPaise = (input: string): number => {
  const cleaned = input.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return NaN;
  const [whole, fraction = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
};
export const monthLabel = (month: string) => {
  return new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${month}-01T12:00:00Z`));
};
export const shiftMonth = (month: string, offset: number) => {
  const [year, current] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, current - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
};
export const personalSpend = (transaction: Transaction, all: Transaction[]): number => {
  if (transaction.excluded) return 0;
  if (transaction.kind === 'expense') return transaction.personalSharePaise;
  if (transaction.kind !== 'refund' || !transaction.linkedTransactionId) return 0;
  const original = all.find(
    (entry) => entry.id === transaction.linkedTransactionId && entry.kind === 'expense',
  );
  if (!original || original.excluded) return 0;
  // Allocate sequential refunds against the original bill; never refund more than its personal share.
  const refunds = all
    .filter(
      (entry) =>
        entry.kind === 'refund' && !entry.excluded && entry.linkedTransactionId === original.id,
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
  let paidBack = 0;
  for (const refund of refunds) {
    const cumulative = Math.min(original.amountPaise, paidBack + refund.amountPaise);
    const share =
      Math.round((cumulative * original.personalSharePaise) / original.amountPaise) -
      Math.round((paidBack * original.personalSharePaise) / original.amountPaise);
    if (refund.id === transaction.id) return -share;
    paidBack = cumulative;
  }
  return 0;
};
export const outstanding = (transaction: Transaction, all: Transaction[]) => {
  if (transaction.kind !== 'expense') return 0;
  const credits = all
    .filter(
      (entry) => entry.kind === 'reimbursement' && entry.linkedTransactionId === transaction.id,
    )
    .reduce((sum, entry) => sum + entry.amountPaise, 0);
  return Math.max(
    0,
    transaction.amountPaise - transaction.personalSharePaise - transaction.settledPaise - credits,
  );
};

export const suggestReimbursements = (transactions: Transaction[]) => {
  const suggestions: { credit: Transaction; expense: Transaction; needsShare: boolean }[] = [];
  const credits = transactions.filter(
    (entry) =>
      ((entry.kind === 'income' && entry.categoryId !== 'salary') ||
        entry.kind === 'reimbursement') &&
      !entry.linkedTransactionId,
  );
  for (const credit of credits) {
    for (const expense of transactions.filter((entry) => entry.kind === 'expense')) {
      const days = (Date.parse(credit.date) - Date.parse(expense.date)) / 86400000;
      if (days < 0 || days > 14) continue;
      const owed = outstanding(expense, transactions);
      const needsShare = expense.personalSharePaise === expense.amountPaise;
      if (credit.amountPaise === (needsShare ? expense.amountPaise : owed))
        suggestions.push({ credit, expense, needsShare });
    }
  }
  return suggestions;
};
export const monthSummary = (data: AppData, month: string) => {
  const entries = data.transactions.filter((entry) => entry.date.startsWith(month));
  const spend = entries.reduce((sum, entry) => sum + personalSpend(entry, data.transactions), 0);
  const income = entries
    .filter((entry) => entry.kind === 'income' && !entry.excluded)
    .reduce((sum, entry) => sum + entry.amountPaise, 0);
  const excluded = entries
    .filter((entry) => entry.kind === 'expense' && entry.excluded)
    .reduce((sum, entry) => sum + entry.personalSharePaise, 0);
  const owed = entries.reduce((sum, entry) => sum + outstanding(entry, data.transactions), 0);
  const cashOut = entries
    .filter((entry) => entry.kind === 'expense')
    .reduce((sum, entry) => sum + entry.amountPaise, 0);
  return {
    entries,
    spend,
    income,
    excluded,
    owed,
    cashOut,
    savings: income - spend,
    savingsRate: income > 0 ? ((income - spend) / income) * 100 : null,
  };
};
export const categoryTotals = (entries: Transaction[], all: Transaction[]) => {
  return entries.reduce<Record<string, number>>((totals, entry) => {
    const original =
      entry.kind === 'refund' ? all.find((item) => item.id === entry.linkedTransactionId) : null;
    const category = original?.categoryId ?? entry.categoryId;
    totals[category] = (totals[category] || 0) + personalSpend(entry, all);
    return totals;
  }, {});
};
export const duplicateOf = (
  candidate: Pick<Transaction, 'date' | 'amountPaise' | 'merchant' | 'kind' | 'sourceKey'>,
  entries: Transaction[],
) => {
  const exact =
    candidate.sourceKey && entries.find((entry) => entry.sourceKey === candidate.sourceKey);
  if (exact) return { entry: exact, exact: true };
  const normal = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const entry = entries.find(
    (entry) =>
      entry.kind === candidate.kind &&
      entry.amountPaise === candidate.amountPaise &&
      entry.date === candidate.date &&
      normal(entry.merchant) === normal(candidate.merchant),
  );
  return entry ? { entry, exact: false } : null;
};
export const recommendCards = (
  merchant: string,
  amountPaise: number,
  preferences: Preferences,
  transactions: Transaction[],
  month: string,
) => {
  return preferences.rewardRules
    .filter(
      (rule) =>
        rule.enabled &&
        rule.verifiedOn >= `${shiftMonth(today().slice(0, 7), -6)}-01` &&
        rule.verifiedOn <= today() &&
        (rule.merchant === '*' || merchant.toLowerCase().includes(rule.merchant.toLowerCase())) &&
        amountPaise >= rule.minSpendPaise,
    )
    .map((rule) => {
      const used = transactions
        .filter(
          (entry) =>
            entry.date.startsWith(month) &&
            entry.accountId === rule.accountId &&
            entry.kind === 'expense' &&
            (rule.merchant === '*' ||
              entry.merchant.toLowerCase().includes(rule.merchant.toLowerCase())) &&
            entry.amountPaise >= rule.minSpendPaise,
        )
        .reduce((sum, entry) => sum + Math.round((entry.amountPaise * rule.ratePercent) / 100), 0);
      const available = rule.capPaise === 0 ? Infinity : Math.max(0, rule.capPaise - used);
      return {
        rule,
        account: preferences.accounts.find((account) => account.id === rule.accountId),
        reward: Math.max(
          0,
          Math.min(Math.round((amountPaise * rule.ratePercent) / 100), available) - rule.feePaise,
        ),
      };
    })
    .filter((item) => item.account)
    .sort((a, b) => b.reward - a.reward);
};
