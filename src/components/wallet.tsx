'use client';
import { useState, type FormEvent } from 'react';
import { CreditCard, Plus, ShieldCheck } from 'lucide-react';
import { Modal, ErrorNotice } from './ui';
import {
  accountSchema,
  rewardRuleSchema,
  type Account,
  type AppData,
  type Preferences,
} from '@/lib/schema';
import { recommendCards, rupees, today, toPaise } from '@/lib/finance';

export const Wallet = ({
  data,
  month,
  onSave,
}: {
  data: AppData;
  month: string;
  onSave: (preferences: Preferences) => Promise<void>;
}) => {
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('1000');
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const recommendations = recommendCards(
    merchant,
    toPaise(amount) || 0,
    data.preferences,
    data.transactions,
    month,
  );
  const accountSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const fields = new FormData(event.currentTarget);
    try {
      const account = accountSchema.parse({
        id: editing === 'new' ? crypto.randomUUID() : editing?.id,
        name: fields.get('name'),
        type: fields.get('type'),
        lastFour: fields.get('lastFour'),
        billingDay: fields.get('billingDay') ? Number(fields.get('billingDay')) : null,
        milestonePaise: toPaise(String(fields.get('milestone') || '0')),
        milestonePeriod: fields.get('period'),
      });
      await onSave({
        ...data.preferences,
        accounts: [
          ...data.preferences.accounts.filter((entry) => entry.id !== account.id),
          account,
        ],
      });
      setEditing(null);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  };
  const ruleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const fields = new FormData(event.currentTarget);
    try {
      const rule = rewardRuleSchema.parse({
        id: crypto.randomUUID(),
        accountId: fields.get('account'),
        merchant: fields.get('merchant'),
        ratePercent: Number(fields.get('rate')),
        capPaise: toPaise(String(fields.get('cap') || '0')),
        minSpendPaise: toPaise(String(fields.get('minimum') || '0')),
        feePaise: toPaise(String(fields.get('fee') || '0')),
        sourceUrl: fields.get('url'),
        verifiedOn: String(fields.get('date')),
        enabled: true,
      });
      await onSave({ ...data.preferences, rewardRules: [...data.preferences.rewardRules, rule] });
      setRuleOpen(false);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  };
  const account = editing && editing !== 'new' ? editing : undefined;
  return (
    <div className="space-y-6">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>A little smarter at checkout</h2>
            <p>Recommendations from your verified reward rules</p>
          </div>
          <ShieldCheck size={23} className="text-accent" />
        </div>
        <div className="p-6 pt-0">
          <div className="grid sm:grid-cols-3 gap-3">
            <input
              className="sm:col-span-2"
              aria-label="Merchant to recommend a card for"
              placeholder="Where are you spending? e.g. Amazon"
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
            />
            <input
              aria-label="Purchase amount in rupees"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          {recommendations.length > 0 ? (
            <div className="space-y-3 mt-5">
              {recommendations.slice(0, 3).map((item, index) => (
                <div key={item.rule.id} className="recommendation">
                  <div>
                    <span className="text-xs text-accent">
                      {index === 0 ? 'BEST MATCH' : 'ALSO CONSIDER'}
                    </span>
                    <h3 className="mt-1">{item.account?.name}</h3>
                    <p className="text-xs text-muted mt-1">
                      {item.rule.ratePercent}% · verified {item.rule.verifiedOn} ·{' '}
                      <a href={item.rule.sourceUrl} target="_blank" rel="noreferrer">
                        issuer source ↗
                      </a>
                    </p>
                  </div>
                  <strong>
                    {rupees(item.reward)}
                    <small className="block text-xs text-muted font-normal">estimated reward</small>
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted mt-5">
              Add a verified rule below to get reliable recommendations. Rates and milestones are
              not assumed.
            </p>
          )}
        </div>
      </section>
      <div className="flex justify-between items-center">
        <h2>In your wallet</h2>
        <button
          className="button secondary"
          onClick={() => {
            setError(null);
            setEditing('new');
          }}
        >
          <Plus size={16} />
          Add account
        </button>
      </div>
      <div className="wallet-grid">
        {data.preferences.accounts.map((account, index) => {
          const quarterStart = `${month.slice(0, 4)}-${String(Math.floor((Number(month.slice(5)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
          const spent = data.transactions
            .filter(
              (entry) =>
                entry.accountId === account.id &&
                entry.kind === 'expense' &&
                (account.milestonePeriod === 'month'
                  ? entry.date.startsWith(month)
                  : entry.date >= quarterStart && entry.date <= `${month}-31`),
            )
            .reduce((sum, entry) => sum + entry.amountPaise, 0);
          return (
            <button
              key={account.id}
              className={`wallet-card tone-${index % 3}`}
              onClick={() => {
                setError(null);
                setEditing(account);
              }}
            >
              <div className="flex justify-between">
                <span className="eyebrow">
                  {account.type === 'card' ? 'CREDIT CARD' : account.type.toUpperCase()}
                </span>
                <CreditCard size={23} strokeWidth={1.2} />
              </div>
              <div className="card-chip" />
              <h3>{account.name}</h3>
              <div className="flex justify-between text-xs mt-3">
                <span>•••• {account.lastFour || '— — — —'}</span>
                <span>
                  {account.billingDay ? `Bills on ${account.billingDay}` : 'Edit details ↗'}
                </span>
              </div>
              {account.milestonePaise > 0 && (
                <div className="mt-4 text-xs">
                  <div className="budget-track">
                    <span
                      style={{ width: `${Math.min(100, (spent / account.milestonePaise) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-2">
                    {rupees(spent)} / {rupees(account.milestonePaise)} · {account.milestonePeriod}
                  </p>
                </div>
              )}
            </button>
          );
        })}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Reward rules</h2>
            <p>Verify against your issuer. Rules older than six months stop recommending.</p>
          </div>
          <button
            className="button secondary"
            onClick={() => {
              setError(null);
              setRuleOpen(true);
            }}
          >
            <Plus size={16} />
            Add rule
          </button>
        </div>
        <div className="px-6 pb-6 space-y-3">
          {data.preferences.rewardRules.map((rule) => (
            <div key={rule.id} className="summary-line">
              <span>
                {rule.merchant} ·{' '}
                {data.preferences.accounts.find((account) => account.id === rule.accountId)?.name}
                <small className="block text-muted">
                  {rule.ratePercent}% · {rule.verifiedOn}
                </small>
              </span>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={async (event) => {
                    try {
                      await onSave({
                        ...data.preferences,
                        rewardRules: data.preferences.rewardRules.map((entry) =>
                          entry.id === rule.id
                            ? { ...entry, enabled: event.target.checked }
                            : entry,
                        ),
                      });
                    } catch (error) {
                      setError(error);
                    }
                  }}
                />
                Enabled
              </label>
            </div>
          ))}
          {!data.preferences.rewardRules.length && (
            <p className="text-sm text-muted">
              No verified rules yet. Store a cashback rate or cash-equivalent point value, caps, and
              any fees.
            </p>
          )}
          <ErrorNotice error={!editing && !ruleOpen ? error : null} />
        </div>
      </section>
      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={account ? 'Edit account' : 'Add account'}
        >
          <form className="space-y-4 mt-6" onSubmit={accountSave}>
            <label className="field">
              Name
              <input name="name" required defaultValue={account?.name} />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="field">
                Type
                <select name="type" defaultValue={account?.type || 'card'}>
                  <option value="card">Credit card</option>
                  <option value="bank">Bank account</option>
                  <option value="cash">Cash</option>
                </select>
              </label>
              <label className="field">
                Last four digits
                <input
                  name="lastFour"
                  maxLength={4}
                  pattern="[0-9]{0,4}"
                  defaultValue={account?.lastFour}
                />
              </label>
            </div>
            <label className="field">
              Billing day (optional)
              <input
                name="billingDay"
                type="number"
                min="1"
                max="31"
                defaultValue={account?.billingDay || ''}
              />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="field">
                Milestone target (₹)
                <input
                  name="milestone"
                  inputMode="decimal"
                  defaultValue={(account?.milestonePaise || 0) / 100}
                />
              </label>
              <label className="field">
                Period
                <select name="period" defaultValue={account?.milestonePeriod}>
                  <option value="month">Month</option>
                  <option value="quarter">Quarter</option>
                </select>
              </label>
            </div>
            <ErrorNotice error={error} />
            <button className="button primary w-full" disabled={busy}>
              Save account
            </button>
          </form>
        </Modal>
      )}
      {ruleOpen && (
        <Modal
          open
          onClose={() => setRuleOpen(false)}
          title="Add a verified reward rule"
          description="Use issuer terms, not an AI guess. Enter a cash-equivalent reward rate."
        >
          <form className="space-y-4 mt-6" onSubmit={ruleSave}>
            <label className="field">
              Account
              <select name="account">
                {data.preferences.accounts
                  .filter((account) => account.type !== 'cash')
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Merchant (or * for all)
              <input name="merchant" required placeholder="Amazon" />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="field">
                Reward rate (%)
                <input name="rate" type="number" min="0" max="100" step="0.01" required />
              </label>
              <label className="field">
                Monthly reward cap (₹)
                <input name="cap" defaultValue="0" />
                <small className="text-muted">0 = uncapped</small>
              </label>
              <label className="field">
                Minimum purchase (₹)
                <input name="minimum" defaultValue="0" />
              </label>
              <label className="field">
                Fee per purchase (₹)
                <input name="fee" defaultValue="0" />
              </label>
            </div>
            <label className="field">
              Issuer source URL
              <input name="url" type="url" required />
            </label>
            <label className="field">
              Last verified
              <input name="date" type="date" max={today()} defaultValue={today()} required />
            </label>
            <ErrorNotice error={error} />
            <button className="button primary w-full" disabled={busy}>
              Save verified rule
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
};
