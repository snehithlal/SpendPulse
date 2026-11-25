'use client';
import { useState } from 'react';
import { Lightbulb, Sparkles } from 'lucide-react';
import { ErrorNotice } from './ui';
import {
  categoryTotals,
  monthSummary,
  recommendCards,
  rupees,
  suggestReimbursements,
} from '@/lib/finance';
import { callIntegration, type StorageMode } from '@/lib/repository';
import type { AppData, Transaction } from '@/lib/schema';

export const Insights = ({
  data,
  month,
  mode,
  onEdit,
}: {
  data: AppData;
  month: string;
  mode: StorageMode;
  onEdit: (entry: Transaction) => void;
}) => {
  const [aiText, setAIText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const summary = monthSummary(data, month);
  const categories = categoryTotals(summary.entries, data.transactions);
  const matches = suggestReimbursements(data.transactions).filter((match) =>
    match.credit.date.startsWith(month),
  );
  const insights: { title: string; body: string }[] = [];
  if (summary.owed > 0)
    insights.push({
      title: 'A friendly follow-up',
      body: `${rupees(summary.owed)} is still owed on this month’s shared expenses. Check your splits before your next catch-up.`,
    });
  const orders = summary.entries.filter(
    (entry) => entry.categoryId === 'groceries' && entry.kind === 'expense',
  );
  if (orders.length >= 3)
    insights.push({
      title: `${orders.length} quick-commerce orders`,
      body: 'Try batching purchases into a weekly order. Delivery and small-basket fees are only counted when visible in a bill.',
    });
  for (const category of data.preferences.categories) {
    const budget = data.preferences.budgets[category.id] || 0;
    if (budget > 0 && categories[category.id] > budget)
      insights.push({
        title: `${category.name} is above plan`,
        body: `${rupees(categories[category.id])} spent against ${rupees(budget)} planned. Adjust next month’s limit or review the entries.`,
      });
  }
  const subscriptions = summary.entries.filter(
    (entry) => entry.categoryId === 'subscriptions' && entry.kind === 'expense',
  );
  if (subscriptions.length)
    insights.push({
      title: 'Give subscriptions a quick check',
      body: `${subscriptions.map((entry) => entry.merchant).join(', ')} total ${rupees(subscriptions.reduce((sum, entry) => sum + entry.amountPaise, 0))} this month. Keep the ones you actually use.`,
    });
  const unmatched = summary.entries.filter(
    (entry) => ['refund', 'reimbursement'].includes(entry.kind) && !entry.linkedTransactionId,
  );
  if (unmatched.length)
    insights.push({
      title: 'Some credits need a home',
      body: `${unmatched.length} refunds or reimbursements are unlinked. Link them to the original expenses for accurate totals.`,
    });
  for (const entry of summary.entries.filter((entry) => entry.kind === 'expense')) {
    const before = data.transactions.filter(
      (candidate) =>
        candidate.date < entry.date ||
        (candidate.date === entry.date && candidate.createdAt < entry.createdAt),
    );
    const recommendations = recommendCards(
      entry.merchant,
      entry.amountPaise,
      data.preferences,
      before,
      month,
    );
    const best = recommendations[0];
    const used = recommendations.find((item) => item.account?.id === entry.accountId);
    if (best && used && best.reward > used.reward && best.account?.id !== entry.accountId)
      insights.push({
        title: `A better card for ${entry.merchant}`,
        body: `${best.account?.name} could have earned about ${rupees(best.reward - used.reward)} more under your verified rules.`,
      });
  }
  if (!insights.length)
    insights.push({
      title: 'Good habits start with small entries',
      body: 'Keep adding income and expenses. Your spending patterns and useful nudges will appear here without AI.',
    });
  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await callIntegration('insights', {
        facts: insights,
        summary: { spend: summary.spend, income: summary.income, owed: summary.owed },
        month,
      });
      setAIText(result.text || 'No additional suggestions.');
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <div className="insights-intro">
        <span className="eyebrow">SMALL SHIFTS. REAL PROGRESS.</span>
        <h2>
          Your money has a story.
          <br />
          Here’s what it’s saying.
        </h2>
        <p>Practical observations from your records. No AI required.</p>
      </div>
      {matches.length > 0 && (
        <section className="panel p-6">
          <h2>These credits might be reimbursements</h2>
          <p className="text-sm text-muted mt-2">
            Matching amounts within 14 days are suggestions, not confirmed relationships.
          </p>
          {matches.slice(0, 8).map(({ credit, expense, needsShare }) => (
            <div className="summary-line" key={`${credit.id}-${expense.id}`}>
              <div>
                <strong>
                  {credit.merchant} → {expense.merchant}
                </strong>
                <p className="text-xs text-muted mt-2">
                  {rupees(credit.amountPaise)} ·{' '}
                  {needsShare
                    ? 'Set your personal share first. Use ₹0 for a fully reimbursed pass-through.'
                    : 'Review and link this credit to settle the outstanding share.'}
                </p>
              </div>
              <button
                className="button secondary"
                onClick={() =>
                  onEdit(
                    needsShare
                      ? expense
                      : {
                          ...credit,
                          kind: 'reimbursement',
                          categoryId: expense.categoryId,
                          linkedTransactionId: expense.id,
                        },
                  )
                }
              >
                {needsShare ? 'Review expense share' : 'Review link'}
              </button>
            </div>
          ))}
        </section>
      )}
      <div className="settings-grid">
        {insights.map((insight) => (
          <section className="panel p-6" key={insight.title}>
            <Lightbulb size={23} className="text-accent mb-4" />
            <h3>{insight.title}</h3>
            <p className="text-sm text-muted mt-3 leading-relaxed">{insight.body}</p>
          </section>
        ))}
      </div>
      <section className="panel p-6">
        <div className="flex justify-between items-center gap-4">
          <div>
            <h2>A second perspective</h2>
            <p className="text-sm text-muted mt-2">
              Optional AI explanations based on the facts above.
            </p>
          </div>
          <button
            className="button secondary"
            disabled={mode !== 'cloud' || !data.preferences.aiEnabled || busy}
            onClick={ask}
          >
            <Sparkles size={16} />
            {busy ? 'Thinking…' : 'Get savings tips'}
          </button>
        </div>
        {(mode !== 'cloud' || !data.preferences.aiEnabled) && (
          <p className="text-xs text-muted mt-4">
            {mode !== 'cloud'
              ? 'Set up Gemini and open your cloud ledger in Settings.'
              : 'AI is off. Turn it on in Settings to get Gemini suggestions.'}
          </p>
        )}
        <ErrorNotice error={error} />
        {aiText && <p className="whitespace-pre-wrap text-sm leading-relaxed mt-6">{aiText}</p>}
      </section>
    </div>
  );
};
