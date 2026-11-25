'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Mic, Sparkles, Square } from 'lucide-react';
import { Modal, ErrorNotice } from './ui';
import {
  transactionSchema,
  type AppData,
  type Transaction,
  type TransactionDraft,
} from '@/lib/schema';
import { today, toPaise } from '@/lib/finance';
import { parseEntry } from '@/lib/parser';
import { callIntegration } from '@/lib/repository';

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export const TransactionEditor = ({
  data,
  initial,
  draft,
  voice = false,
  allowAI = false,
  onClose,
  onSave,
}: {
  data: AppData;
  initial?: Transaction;
  draft?: TransactionDraft;
  voice?: boolean;
  allowAI?: boolean;
  onClose: () => void;
  onSave: (entry: Transaction) => Promise<void>;
}) => {
  const seed = initial || draft;
  const [entryId] = useState(() => initial?.id || crypto.randomUUID());
  const [kind, setKind] = useState<Transaction['kind']>(seed?.kind || 'expense');
  const [merchant, setMerchant] = useState(seed?.merchant || '');
  const [amount, setAmount] = useState(seed?.amountPaise ? String(seed.amountPaise / 100) : '');
  const [date, setDate] = useState(
    seed?.date ||
      (draft?.source && ['receipt', 'statement', 'gmail'].includes(draft.source) ? '' : today()),
  );
  const [categoryId, setCategory] = useState(
    seed?.categoryId || (seed?.kind === 'income' ? 'salary' : 'food'),
  );
  const [accountId, setAccount] = useState(seed?.accountId || 'cash');
  const [notes, setNotes] = useState(seed?.notes || '');
  const [excluded, setExcluded] = useState(initial?.excluded || false);
  const [split, setSplit] = useState(!!initial && initial.personalSharePaise < initial.amountPaise);
  const [share, setShare] = useState(initial ? String(initial.personalSharePaise / 100) : '');
  const [settled, setSettled] = useState(initial ? String(initial.settledPaise / 100) : '0');
  const [linkedId, setLinkedId] = useState(initial?.linkedTransactionId || '');
  const [transcript, setTranscript] = useState('');
  const [source, setSource] = useState<Transaction['source']>(
    initial?.source || draft?.source || 'manual',
  );
  const [listening, setListening] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const recognition = useRef<Recognition | null>(null);
  useEffect(
    () => () => {
      recognition.current?.stop();
    },
    [],
  );
  const applyDraft = (value: TransactionDraft) => {
    if (value.amountPaise) setAmount(String(value.amountPaise / 100));
    if (value.merchant) setMerchant(value.merchant);
    if (value.date) setDate(value.date);
    const categoryKind = (value.kind || kind) === 'income' ? 'income' : 'expense';
    if (
      value.categoryId &&
      data.preferences.categories.some(
        (category) => category.id === value.categoryId && category.kind === categoryKind,
      )
    )
      setCategory(value.categoryId);
    else if (
      !data.preferences.categories.some(
        (category) => category.id === categoryId && category.kind === categoryKind,
      )
    )
      setCategory(categoryKind === 'income' ? 'other-income' : 'other');
    if (
      value.accountId &&
      data.preferences.accounts.some((account) => account.id === value.accountId)
    )
      setAccount(value.accountId);
    if (value.kind) setKind(value.kind);
    setSource('voice');
  };
  const listen = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const browser = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Engine = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Engine) {
      setError(
        new Error(
          'Voice recognition is unavailable. Type a phrase below, or use your keyboard microphone.',
        ),
      );
      return;
    }
    const engine = new Engine();
    recognition.current = engine;
    engine.lang = data.preferences.recognitionLanguage;
    engine.continuous = false;
    engine.interimResults = false;
    engine.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(' ');
      setTranscript(text);
      applyDraft(parseEntry(text, data.preferences));
    };
    engine.onerror = (event) => {
      setError(new Error(`Voice input: ${event.error}. You can still type below.`));
      setListening(false);
    };
    engine.onend = () => setListening(false);
    try {
      engine.start();
      setListening(true);
      setError(null);
    } catch (error) {
      setError(error);
    }
  };
  const close = () => {
    recognition.current?.stop();
    onClose();
  };
  const parseWithAI = async () => {
    setPending(true);
    setError(null);
    try {
      const response = await callIntegration('parse', { text: transcript, source: 'voice' });
      applyDraft(response.drafts?.[0] || {});
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const paise = toPaise(amount);
      const entry = transactionSchema.parse({
        id: entryId,
        date,
        merchant,
        amountPaise: paise,
        kind,
        categoryId,
        accountId,
        notes,
        excluded,
        personalSharePaise: kind === 'expense' && split ? toPaise(share) : paise,
        settledPaise: kind === 'expense' && split ? toPaise(settled || '0') : 0,
        linkedTransactionId:
          ['refund', 'reimbursement'].includes(kind) && linkedId ? linkedId : null,
        source,
        sourceKey: initial?.sourceKey || draft?.sourceKey || null,
        importId: initial?.importId || null,
        createdAt: initial?.createdAt || new Date().toISOString(),
      });
      await onSave(entry);
      close();
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  };
  const categories = data.preferences.categories.filter(
    (category) => category.kind === (kind === 'income' ? 'income' : 'expense'),
  );
  return (
    <Modal
      open
      onClose={close}
      title={
        initial ? 'Edit transaction' : voice ? 'Say it. Track it.' : 'A little entry. More clarity.'
      }
      description="Your money, in your words. Review the details before saving."
    >
      <form onSubmit={submit} className="space-y-5 mt-6">
        <div className="segmented">
          {(['expense', 'income'] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={kind === value ? 'active' : ''}
              onClick={() => {
                setKind(value);
                setCategory(value === 'income' ? 'salary' : 'food');
              }}
            >
              {value === 'expense' ? '↗ Expense' : '↙ Income'}
            </button>
          ))}
          <select
            aria-label="Other transaction type"
            value={['expense', 'income'].includes(kind) ? '' : kind}
            onChange={(event) => {
              if (event.target.value) {
                setKind(event.target.value as Transaction['kind']);
                setCategory('other');
              }
            }}
          >
            <option value="">More types</option>
            <option value="refund">Refund</option>
            <option value="transfer">Transfer</option>
            <option value="reimbursement">Reimbursement</option>
          </select>
        </div>
        {voice && (
          <div className="voice-box">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">
                English / Manglish · {data.preferences.recognitionLanguage}
              </span>
              <button
                type="button"
                onClick={listen}
                className={listening ? 'button danger' : 'button secondary'}
              >
                {listening ? <Square size={16} /> : <Mic size={16} />}
                {listening ? 'Stop' : 'Speak'}
              </button>
            </div>
            <textarea
              aria-label="Voice transcript"
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder="Innale Swiggy-il 350 rupees spend cheythu"
              className="mt-3"
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                className="button secondary"
                onClick={() => applyDraft(parseEntry(transcript, data.preferences))}
              >
                Fill with rules
              </button>
              {allowAI && data.preferences.aiEnabled && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={pending || !transcript}
                  onClick={parseWithAI}
                >
                  <Sparkles size={15} />
                  Fill with AI
                </button>
              )}
            </div>
            <p className="text-xs text-muted mt-3">
              Your browser may use an online speech service. Audio is not stored by SpendPulse.
            </p>
          </div>
        )}
        <label className="field">
          Amount <span className="text-muted">INR</span>
          <div className="amount-input">
            <span>₹</span>
            <input
              aria-label="Amount"
              inputMode="decimal"
              placeholder="0.00"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
        </label>
        <label className="field">
          {kind === 'income' ? 'Income source' : 'Merchant / description'}
          <input
            required
            maxLength={120}
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            placeholder={kind === 'income' ? 'Salary, freelance, interest…' : 'Where did it go?'}
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="field">
            Date
            <input
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label className="field">
            Category
            <select value={categoryId} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          Account / payment method
          <select value={accountId} onChange={(event) => setAccount(event.target.value)}>
            {data.preferences.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        {['refund', 'reimbursement'].includes(kind) && (
          <label className="field">
            Link to original expense
            <select value={linkedId} onChange={(event) => setLinkedId(event.target.value)}>
              <option value="">Unlinked — review later</option>
              {data.transactions
                .filter((entry) => entry.kind === 'expense' && entry.id !== initial?.id)
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.date} · {entry.merchant} · ₹{entry.amountPaise / 100}
                  </option>
                ))}
            </select>
            <span className="text-xs text-muted">
              Link refunds to reduce spending. Reimbursements settle a split, without counting as
              income.
            </span>
          </label>
        )}
        {kind === 'expense' && (
          <>
            <label className="check-label">
              <input
                type="checkbox"
                checked={split}
                onChange={(event) => {
                  setSplit(event.target.checked);
                  if (!share) setShare(amount);
                }}
              />
              Split this expense
            </label>
            {split && (
              <div className="grid grid-cols-2 gap-4">
                <label className="field">
                  My share (₹)
                  <input
                    inputMode="decimal"
                    value={share}
                    onChange={(event) => setShare(event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setShare(String(Math.round(toPaise(amount) / 2) / 100))}
                  >
                    Split equally with 1 friend
                  </button>
                </label>
                <label className="field">
                  Already returned (₹)
                  <input
                    inputMode="decimal"
                    value={settled}
                    onChange={(event) => setSettled(event.target.value)}
                  />
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => {
                      const credits = data.transactions
                        .filter(
                          (entry) =>
                            entry.kind === 'reimbursement' &&
                            entry.linkedTransactionId === initial?.id,
                        )
                        .reduce((sum, entry) => sum + entry.amountPaise, 0);
                      setSettled(
                        String(Math.max(0, toPaise(amount) - toPaise(share) - credits) / 100),
                      );
                    }}
                  >
                    Mark settled
                  </button>
                </label>
              </div>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={excluded}
                onChange={(event) => setExcluded(event.target.checked)}
              />
              Exclude from regular spending
            </label>
          </>
        )}
        <label className="field">
          Note <span className="text-muted">optional</span>
          <textarea
            value={notes}
            maxLength={1000}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Anything worth remembering"
          />
        </label>
        <ErrorNotice error={error} />
        <button type="submit" className="button primary w-full" disabled={pending}>
          {pending ? 'Saving…' : initial ? 'Save changes' : `Add ${kind}`}
        </button>
      </form>
    </Modal>
  );
};
