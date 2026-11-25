'use client';
import { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  EyeOff,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react';
import { CategoryIcon, EmptyState } from './ui';
import { rupees, outstanding, recommendCards } from '@/lib/finance';
import { downloadText } from '@/lib/repository';
import type { AppData, Transaction } from '@/lib/schema';

export const TransactionList = ({
  entries,
  data,
  onEdit,
  onDelete,
  compact = false,
}: {
  entries: Transaction[];
  data: AppData;
  onEdit: (entry: Transaction) => void;
  onDelete?: (entry: Transaction) => void;
  compact?: boolean;
}) => {
  if (!entries.length)
    return (
      <EmptyState
        title="A fresh page"
        description="Add your first expense or income. Every little entry counts."
      />
    );
  return (
    <div className="transaction-list">
      {entries.map((entry) => {
        const category = data.preferences.categories.find(
          (category) => category.id === entry.categoryId,
        );
        const account = data.preferences.accounts.find((account) => account.id === entry.accountId);
        const incoming = ['income', 'refund', 'reimbursement'].includes(entry.kind);
        const before = data.transactions.filter(
          (candidate) =>
            candidate.date < entry.date ||
            (candidate.date === entry.date && candidate.createdAt < entry.createdAt),
        );
        const options =
          !compact && entry.kind === 'expense'
            ? recommendCards(
                entry.merchant,
                entry.amountPaise,
                data.preferences,
                before,
                entry.date.slice(0, 7),
              )
            : [];
        const actual = options.find((option) => option.account?.id === entry.accountId);
        const better =
          actual && options[0]?.reward > actual.reward && options[0].account?.id !== entry.accountId
            ? options[0]
            : null;
        return (
          <div key={entry.id} className="transaction-row">
            <CategoryIcon category={category} />
            <button className="transaction-description text-left" onClick={() => onEdit(entry)}>
              <strong>{entry.merchant}</strong>
              <span>
                {compact
                  ? category?.name
                  : `${entry.date.slice(8)} ${new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(new Date(`${entry.date}T12:00:00`))} · ${category?.name}`}{' '}
                {entry.excluded && <EyeOff size={12} aria-label="Excluded" />}
              </span>
              {better && (
                <span
                  className="text-accent"
                  title="Estimate from your verified rules, not a statement of rewards actually earned."
                >
                  Next time: {better.account?.name}
                </span>
              )}
            </button>
            {!compact && (
              <span className="transaction-account">
                {account?.name}
                <small>
                  {entry.source}
                  {outstanding(entry, data.transactions) > 0
                    ? ` · ${rupees(outstanding(entry, data.transactions))} owed`
                    : ''}
                </small>
              </span>
            )}
            <div className={`transaction-amount ${incoming ? 'income' : ''}`}>
              <strong>
                {incoming ? '+' : entry.kind === 'transfer' ? '' : '−'}
                {rupees(entry.amountPaise, entry.amountPaise % 100 !== 0)}
              </strong>
              <span>
                {entry.kind === 'expense' && entry.personalSharePaise !== entry.amountPaise
                  ? `${rupees(entry.personalSharePaise)} my share`
                  : entry.kind}
              </span>
            </div>
            {!compact && (
              <div className="flex gap-1">
                <button
                  className="icon-button"
                  aria-label={`Edit ${entry.merchant}`}
                  onClick={() => onEdit(entry)}
                >
                  <Pencil size={15} />
                </button>
                {onDelete && (
                  <button
                    className="icon-button"
                    aria-label={`Delete ${entry.merchant}`}
                    onClick={() => onDelete(entry)}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const Ledger = ({
  data,
  month,
  onEdit,
  onDelete,
}: {
  data: AppData;
  month: string;
  onEdit: (entry: Transaction) => void;
  onDelete: (entry: Transaction) => void;
}) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [kind, setKind] = useState('all');
  const [allDates, setAllDates] = useState(false);
  const entries = data.transactions
    .filter(
      (entry) =>
        (allDates || entry.date.startsWith(month)) &&
        (category === 'all' || entry.categoryId === category) &&
        (kind === 'all' || entry.kind === kind) &&
        `${entry.merchant} ${entry.notes}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const exportCsv = () => {
    const escapeCsv = (value: string) =>
      `"${value.replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
    const rows = entries.map((entry) =>
      [
        entry.date,
        entry.merchant,
        (entry.amountPaise / 100).toFixed(2),
        entry.kind,
        data.preferences.categories.find((category) => category.id === entry.categoryId)?.name ||
          '',
        entry.notes,
      ]
        .map(escapeCsv)
        .join(','),
    );
    downloadText(
      `spendpulse-${month}.csv`,
      ['Date,Description,Amount INR,Type,Category,Notes', ...rows].join('\r\n'),
      'text/csv;charset=utf-8',
    );
  };
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <h2>Your money, in detail</h2>
          <p>{entries.length} transactions · made easy to understand</p>
        </div>
        <button className="button secondary" onClick={exportCsv}>
          <Download size={16} />
          Export
        </button>
      </div>
      <div className="ledger-filters">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search transactions"
            placeholder="Search a merchant or note"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          aria-label="Filter category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">All categories</option>
          {data.preferences.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter transaction type"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="all">All types</option>
          {['expense', 'income', 'refund', 'transfer', 'reimbursement'].map((kind) => (
            <option key={kind}>{kind}</option>
          ))}
        </select>
        <label className="check-label">
          <input
            type="checkbox"
            checked={allDates}
            onChange={(event) => setAllDates(event.target.checked)}
          />
          All dates
        </label>
      </div>
      <div className="ledger-subhead">
        <span>
          <ArrowUpRight size={14} /> Expenses
        </span>
        <span>
          <ArrowDownLeft size={14} /> Income
        </span>
        <span className="ml-auto">All amounts in INR</span>
      </div>
      <TransactionList entries={entries} data={data} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
};
