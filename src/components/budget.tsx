'use client';
import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Pie, PieChart, ResponsiveContainer, Cell } from 'recharts';
import { CategoryIcon, ErrorNotice } from './ui';
import { categoryTotals, monthSummary, rupees, toPaise } from '@/lib/finance';
import type { AppData, Preferences } from '@/lib/schema';

export const Budget = ({
  data,
  month,
  onSave,
}: {
  data: AppData;
  month: string;
  onSave: (preferences: Preferences) => Promise<void>;
}) => {
  const [preferences, setPreferences] = useState(data.preferences);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const categories = preferences.categories.filter((category) => category.kind === 'expense');
  const planned = Object.values(preferences.budgets).reduce((sum, value) => sum + value, 0);
  const surplus = preferences.plannedIncomePaise - planned;
  const actual = categoryTotals(monthSummary(data, month).entries, data.transactions);
  const allocation = categories.reduce<Record<string, number>>((result, category) => {
    const account = preferences.budgetAccounts[category.id] || 'axis';
    result[account] = (result[account] || 0) + (preferences.budgets[category.id] || 0);
    return result;
  }, {});
  const chart = categories
    .map((category) => ({
      name: category.name,
      value: preferences.budgets[category.id] || 0,
      color: category.color,
    }))
    .filter((item) => item.value > 0);
  if (surplus > 0) chart.push({ name: 'Savings', value: surplus, color: 'var(--positive)' });
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(preferences);
      setSaved(true);
    } catch (error) {
      setError(error);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="budget-layout">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Make room for what matters</h2>
            <p>Set a monthly intention. Adjust as life happens.</p>
          </div>
        </div>
        <div className="p-6 pt-0">
          <label className="field">
            Planned monthly take-home (₹)
            <input
              type="number"
              min="0"
              step="0.01"
              value={preferences.plannedIncomePaise / 100}
              onChange={(event) => {
                const amount = toPaise(event.target.value);
                if (Number.isFinite(amount))
                  setPreferences({ ...preferences, plannedIncomePaise: amount });
                setSaved(false);
              }}
            />
          </label>
          <div className="divide-y divide-border mt-4">
            {categories.map((category) => (
              <div key={category.id} className="budget-row">
                <div className="flex items-center gap-3">
                  <CategoryIcon category={category} small />
                  <div className="flex-1">
                    <strong className="text-sm font-medium">{category.name}</strong>
                    <p className="text-xs text-muted mt-1">
                      Actual {rupees(actual[category.id] || 0)}
                    </p>
                  </div>
                  <label className="sr-only" htmlFor={`budget-${category.id}`}>
                    {category.name} budget in rupees
                  </label>
                  <input
                    className="budget-number"
                    id={`budget-${category.id}`}
                    type="number"
                    min="0"
                    step="1"
                    value={(preferences.budgets[category.id] || 0) / 100}
                    onChange={(event) => {
                      const amount = toPaise(event.target.value);
                      if (Number.isFinite(amount))
                        setPreferences({
                          ...preferences,
                          budgets: { ...preferences.budgets, [category.id]: amount },
                        });
                      setSaved(false);
                    }}
                  />
                </div>
                <input
                  aria-label={`${category.name} budget slider`}
                  type="range"
                  min="0"
                  max={Math.max(5000000, preferences.budgets[category.id] || 0)}
                  step="10000"
                  value={preferences.budgets[category.id] || 0}
                  onChange={(event) => {
                    setPreferences({
                      ...preferences,
                      budgets: {
                        ...preferences.budgets,
                        [category.id]: Number(event.target.value),
                      },
                    });
                    setSaved(false);
                  }}
                />
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>
                    {['rent', 'emi', 'family'].includes(category.id)
                      ? 'Fixed commitment'
                      : 'Flexible spending'}
                  </span>
                  <select
                    aria-label={`${category.name} funding account`}
                    className="compact-select"
                    value={preferences.budgetAccounts[category.id] || 'axis'}
                    onChange={(event) => {
                      setPreferences({
                        ...preferences,
                        budgetAccounts: {
                          ...preferences.budgetAccounts,
                          [category.id]: event.target.value,
                        },
                      });
                      setSaved(false);
                    }}
                  >
                    {preferences.accounts
                      .filter((account) => account.type === 'bank')
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
          <ErrorNotice error={error} />
          <button className="button primary w-full mt-4" disabled={saving} onClick={save}>
            {saved ? (
              <>
                <Check size={16} />
                Plan saved
              </>
            ) : saving ? (
              'Saving…'
            ) : (
              'Save monthly plan'
            )}
          </button>
        </div>
      </section>
      <div className="space-y-6">
        <section className="panel p-6">
          <span className="eyebrow">THE POSSIBILITY</span>
          <h2 className="text-4xl font-medium mt-4 tracking-tight">{rupees(surplus)}</h2>
          <p className="text-sm text-muted mt-2">
            {surplus < 0 ? 'Over your planned income' : 'Projected monthly savings'}
          </p>
          <div className="relative h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  isAnimationActive={false}
                  data={chart}
                  dataKey="value"
                  innerRadius={70}
                  outerRadius={95}
                  paddingAngle={2}
                  stroke="none"
                >
                  {chart.map((item) => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <strong>
                {preferences.plannedIncomePaise
                  ? Math.round((surplus / preferences.plannedIncomePaise) * 100)
                  : 0}
                %
              </strong>
              <span>savings rate</span>
            </div>
          </div>
          <div className="summary-line">
            <span>Planned income</span>
            <strong>{rupees(preferences.plannedIncomePaise)}</strong>
          </div>
          <div className="summary-line">
            <span>Planned spending</span>
            <strong>{rupees(planned)}</strong>
          </div>
        </section>
        <section className="panel p-6">
          <h2>Give every rupee a home</h2>
          <p className="text-sm text-muted mt-2 mb-5">Your two-bank transfer guide</p>
          {Object.entries(allocation).map(([id, amount]) => (
            <div key={id} className="summary-line">
              <span>
                {preferences.accounts.find((account) => account.id === id)?.name}
                <small className="block text-muted text-xs">Expense allocation</small>
              </span>
              <strong>{rupees(amount)}</strong>
            </div>
          ))}
          <div className="summary-line text-accent">
            <span>Keep for savings in HDFC</span>
            <strong>{rupees(Math.max(0, surplus))}</strong>
          </div>
          <p className="text-xs text-muted mt-5 flex gap-2">
            <ArrowRight size={14} className="shrink-0" />
            Planning only. Actual transactions remain separate; no money is moved.
          </p>
        </section>
      </div>
    </div>
  );
};
