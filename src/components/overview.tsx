'use client';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Layers,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CategoryIcon } from './ui';
import { TransactionList } from './ledger';
import { QuickCardAdvisor } from './quick-card-advisor';
import { categoryTotals, monthSummary, personalSpend, rupees } from '@/lib/finance';
import type { AppData, Transaction } from '@/lib/schema';

export const Overview = ({
  data,
  month,
  onEdit,
  onNavigate,
}: {
  data: AppData;
  month: string;
  onEdit: (entry: Transaction) => void;
  onNavigate: (view: string) => void;
}) => {
  const summary = monthSummary(data, month);
  const categorySpending = categoryTotals(summary.entries, data.transactions);
  const topCategories = data.preferences.categories
    .filter((category) => (categorySpending[category.id] || 0) > 0)
    .sort((a, b) => categorySpending[b.id] - categorySpending[a.id]);
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  let cumulative = 0;
  const chartData = Array.from({ length: days }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    cumulative += summary.entries
      .filter((entry) => entry.date === `${month}-${day}`)
      .reduce((sum, entry) => sum + personalSpend(entry, data.transactions), 0);
    return { day: index + 1, spend: cumulative / 100 };
  });
  const totalBudget = Object.values(data.preferences.budgets).reduce(
    (sum, budget) => sum + budget,
    0,
  );
  const frequent = summary.entries.filter(
    (entry) => entry.categoryId === 'groceries' && entry.kind === 'expense',
  ).length;
  return (
    <div className="space-y-6">
      <div className="hero-grid">
        <section className="balance-card">
          <div className="balance-heading">
            <h2>Personal spending</h2>
            <span className="currency-label">INR</span>
          </div>
          <div className="hero-amount">{rupees(summary.spend)}</div>
          <div className="budget-track">
            <span
              style={{
                width: `${Math.max(0, Math.min(100, (summary.spend / (totalBudget || 1)) * 100))}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted mt-3">
            <span>
              {totalBudget
                ? `${Math.round((summary.spend / totalBudget) * 100)}% of your monthly plan`
                : 'Set your monthly plan'}
            </span>
            <span>{rupees(totalBudget)}</span>
          </div>
          <div className="hero-footer">
            <button onClick={() => onNavigate('budget')}>
              View budget <ArrowUpRight size={16} />
            </button>
          </div>
        </section>
        <div className="stat-grid">
          <section className="stat-card">
            <div className="stat-icon positive">
              <ArrowDownLeft size={16} />
            </div>
            <span>Money in</span>
            <strong>{rupees(summary.income)}</strong>
            <small>Actual income this month</small>
          </section>
          <section className="stat-card">
            <div className="stat-icon positive">
              <TrendingUp size={16} />
            </div>
            <span>Net savings</span>
            <strong>{rupees(summary.savings)}</strong>
            <small>
              {summary.savingsRate === null
                ? 'Add income to see your savings rate'
                : `${summary.savingsRate.toFixed(1)}% of actual income`}
            </small>
          </section>
          <section className="stat-card">
            <div className="stat-icon">
              <ArrowUpRight size={16} />
            </div>
            <span>Friends owe you</span>
            <strong>{rupees(summary.owed)}</strong>
            <small>Unsettled shares of this month’s bills</small>
          </section>
          <section className="stat-card">
            <div className="stat-icon">
              <Layers size={16} />
            </div>
            <span>Excluded spending</span>
            <strong>{rupees(summary.excluded)}</strong>
            <small>Outside your regular budget</small>
          </section>
        </div>
      </div>
      <div className="overview-middle">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Spending trend</h2>
              <p>Cumulative personal spending</p>
            </div>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  minTickGap={32}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  tickFormatter={(value: number) => `₹${Math.round(value / 1000)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    color: 'var(--text)',
                  }}
                  formatter={(value) => [rupees(Number(value) * 100), 'Spent']}
                  labelFormatter={(day) => `Day ${day}`}
                />
                <Area
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="spend"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  fill="url(#spendGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Top categories</h2>
              <p>Ranked by personal spending</p>
            </div>
          </div>
          <div className="space-y-5 px-6 pb-6">
            {topCategories.slice(0, 5).map((category) => (
              <div key={category.id} className="flex gap-3 items-center">
                <CategoryIcon category={category} small />
                <div className="flex-1">
                  <div className="flex justify-between text-sm">
                    <span>{category.name}</span>
                    <strong>{rupees(categorySpending[category.id])}</strong>
                  </div>
                  <div className="category-track">
                    <span
                      style={{
                        width: `${Math.min(100, (categorySpending[category.id] / Math.max(1, summary.spend)) * 100)}%`,
                        background: category.color,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {!topCategories.length && (
              <p className="text-muted text-sm py-8">
                Your category breakdown will appear after your first expense.
              </p>
            )}
          </div>
        </section>
      </div>
      <QuickCardAdvisor data={data} month={month} onWallet={() => onNavigate('wallet')} />
      <div className="overview-bottom">
        <section className="panel">
          <div className="panel-heading">
            <h2>Recent activity</h2>
            <button className="text-link" onClick={() => onNavigate('transactions')}>
              View all <ArrowRight size={15} />
            </button>
          </div>
          <TransactionList
            entries={[...summary.entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)}
            data={data}
            onEdit={onEdit}
            compact
          />
        </section>
        <section className="insight-card">
          <Sparkles size={20} className="text-accent" />
          <h2>
            {summary.owed > 0
              ? 'Unsettled splits'
              : frequent > 4
                ? 'Frequent orders'
                : 'Spending insights'}
          </h2>
          <p>
            {summary.owed > 0
              ? `You’re owed ${rupees(summary.owed)} for shared expenses this month.`
              : frequent > 4
                ? `${frequent} quick-commerce orders this month. A weekly shopping list could help reduce small-basket fees.`
                : 'See subscriptions, changes in spending, and card reward estimates.'}
          </p>
          <button className="button secondary" onClick={() => onNavigate('insights')}>
            Explore insights <ArrowUpRight size={16} />
          </button>
        </section>
      </div>
    </div>
  );
};
