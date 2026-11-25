'use client';
import { useState } from 'react';
import { ArrowUpRight, CreditCard } from 'lucide-react';
import { recommendCards, rupees, toPaise } from '@/lib/finance';
import type { AppData } from '@/lib/schema';

export const QuickCardAdvisor = ({
  data,
  month,
  onWallet,
}: {
  data: AppData;
  month: string;
  onWallet: () => void;
}) => {
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('1000');
  const best = recommendCards(
    merchant,
    toPaise(amount) || 0,
    data.preferences,
    data.transactions,
    month,
  )[0];
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Before your next checkout</h2>
          <p>A quick card check, using your verified reward rules</p>
        </div>
        <CreditCard size={21} className="text-accent" />
      </div>
      <div className="px-6 pb-6">
        <div className="grid sm:grid-cols-3 gap-3">
          <input
            className="sm:col-span-2"
            aria-label="Quick card merchant"
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            placeholder="Merchant, e.g. Amazon, Swiggy, Zepto"
          />
          <input
            aria-label="Quick card purchase amount in rupees"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className="flex items-center justify-between gap-4 mt-4">
          <p className="text-sm text-muted">
            {best ? (
              <>
                <span className="text-accent">{best.account?.name}</span> · approximately{' '}
                {rupees(best.reward)} after configured fees and caps
              </>
            ) : (
              'Add verified rules to see a recommendation. No reward rates are assumed.'
            )}
          </p>
          <button className="text-link shrink-0" onClick={onWallet}>
            My wallet <ArrowUpRight size={15} />
          </button>
        </div>
      </div>
    </section>
  );
};
