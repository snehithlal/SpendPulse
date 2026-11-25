'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from './ui';
import { TransactionList } from './ledger';
import { monthLabel, personalSpend, rupees, today } from '@/lib/finance';
import type { AppData, Transaction } from '@/lib/schema';

export const SpendingCalendar = ({
  data,
  month,
  onEdit,
  onAdd,
}: {
  data: AppData;
  month: string;
  onEdit: (entry: Transaction) => void;
  onAdd: (date: string) => void;
}) => {
  const [selected, setSelected] = useState(today().startsWith(month) ? today() : `${month}-01`);
  const first = new Date(`${month}-01T12:00:00`);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const selectedEntries = data.transactions
    .filter((entry) => entry.date === selected)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const daily = Array.from({ length: days }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}`;
    const entries = data.transactions.filter((entry) => entry.date === date);
    return {
      date,
      spend: entries.reduce((sum, entry) => sum + personalSpend(entry, data.transactions), 0),
      income: entries
        .filter((entry) => entry.kind === 'income' && !entry.excluded)
        .reduce((sum, entry) => sum + entry.amountPaise, 0),
      count: entries.length,
    };
  });
  const maximum = Math.max(1, ...daily.map((day) => day.spend));
  return (
    <div className="space-y-6">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Your month, day by day</h2>
            <p>Tap a date to see its expenses and income</p>
          </div>
          <span className="pill">{monthLabel(month)}</span>
        </div>
        <div className="calendar-grid">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <div className="weekday" key={day}>
              {day}
            </div>
          ))}
          {Array.from({ length: offset }, (_, index) => (
            <div className="calendar-blank" key={`blank-${index}`} />
          ))}
          {daily.map((day, index) => (
            <button
              key={day.date}
              aria-label={`${day.date}, spent ${rupees(day.spend)}, income ${rupees(day.income)}`}
              aria-pressed={selected === day.date}
              className={cn(
                'calendar-day',
                selected === day.date && 'selected',
                day.date === today() && 'today',
              )}
              onClick={() => setSelected(day.date)}
              style={{
                backgroundColor:
                  day.spend > 0
                    ? `color-mix(in srgb, var(--accent) ${3 + (day.spend / maximum) * 17}%, var(--surface))`
                    : undefined,
              }}
            >
              <span>{index + 1}</span>
              {day.spend !== 0 && <strong>{rupees(day.spend)}</strong>}
              {day.income > 0 && <small>+{rupees(day.income)}</small>}
              {day.count > 0 && <i aria-hidden="true" />}
            </button>
          ))}
        </div>
        <div className="flex gap-5 p-5 text-xs text-muted">
          <span>Amounts show personal spending</span>
          <span className="income">+ Income</span>
          <span className="ml-auto">Stronger tint = more spending</span>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              {new Intl.DateTimeFormat('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }).format(new Date(`${selected}T12:00:00`))}
            </h2>
            <p>{selectedEntries.length} entries</p>
          </div>
          <button className="button secondary" onClick={() => onAdd(selected)}>
            <Plus size={16} />
            Add entry
          </button>
        </div>
        <TransactionList entries={selectedEntries} data={data} onEdit={onEdit} />
      </section>
    </div>
  );
};
