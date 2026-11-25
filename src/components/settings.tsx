'use client';
import { useState, type FormEvent } from 'react';
import { Download, LogIn, LogOut, Plus, ShieldCheck, Sun, Moon } from 'lucide-react';
import { CategoryIcon, ErrorNotice, icons, Modal } from './ui';
import {
  backupSchema,
  categorySchema,
  iconNames,
  type AppData,
  type Category,
  type Preferences,
} from '@/lib/schema';
import { callIntegration, downloadText, supabase, type StorageMode } from '@/lib/repository';
import { today } from '@/lib/finance';

export const Settings = ({
  data,
  mode,
  email,
  onMode,
  onSave,
  onRestore,
}: {
  data: AppData;
  mode: StorageMode;
  email?: string;
  onMode: (mode: StorageMode) => void;
  onSave: (preferences: Preferences) => Promise<void>;
  onRestore: (data: AppData) => Promise<void>;
}) => {
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkingAI, setCheckingAI] = useState(false);
  const [aiStatus, setAIStatus] = useState('');
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const change = async (values: Partial<Preferences>) => {
    setError(null);
    try {
      await onSave({ ...data.preferences, ...values });
    } catch (error) {
      setError(error);
    }
  };
  const category = editing && editing !== 'new' ? editing : undefined;
  const saveCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const fields = new FormData(event.currentTarget);
    try {
      const value = categorySchema.parse({
        id: category?.id || crypto.randomUUID(),
        name: fields.get('name'),
        icon: fields.get('icon'),
        color: fields.get('color'),
        kind: fields.get('kind'),
      });
      await onSave({
        ...data.preferences,
        categories: [
          ...data.preferences.categories.filter((entry) => entry.id !== value.id),
          value,
        ],
        budgets:
          value.kind === 'expense'
            ? { ...data.preferences.budgets, [value.id]: data.preferences.budgets[value.id] || 0 }
            : data.preferences.budgets,
      });
      setEditing(null);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  };
  const login = async () => {
    if (!supabase) return;
    const redirectTo = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH || ''}/`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) setError(error);
  };
  const checkAI = async () => {
    setCheckingAI(true);
    setAIStatus('');
    try {
      const result = await callIntegration('ai-status');
      setAIStatus(
        result.configured === true
          ? 'The backend has a Gemini key. Try an AI action to verify it with Google.'
          : 'Gemini key missing. Add GEMINI_API_KEY in Supabase Edge Function Secrets.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection check failed.';
      setAIStatus(`Could not check the integrations function. ${message}`);
    } finally {
      setCheckingAI(false);
    }
  };
  return (
    <div className="settings-grid">
      <section className="panel p-6">
        <div className="flex items-center gap-3">
          <ShieldCheck size={23} className="text-accent" />
          <h2>Backend connection</h2>
        </div>
        <p className="text-sm text-muted mt-3">
          {mode === 'cloud'
            ? `Signed in as ${email || 'owner'}. Your records are stored privately in Supabase.`
            : mode === 'demo'
              ? 'You are exploring synthetic demo data, stored only in this browser.'
              : 'Your records are stored only in this browser. Export a backup regularly.'}
        </p>
        <div className="flex flex-wrap gap-3 mt-5">
          <button className="button secondary" onClick={() => onMode('local')}>
            Use my local ledger
          </button>
          <button className="button secondary" onClick={() => onMode('demo')}>
            Explore demo
          </button>
        </div>
        {supabase ? (
          <div className="mt-4">
            {email ? (
              <div className="flex gap-3">
                <button className="button secondary" onClick={() => onMode('cloud')}>
                  Open cloud ledger
                </button>
                <button
                  className="button secondary"
                  onClick={async () => {
                    await supabase?.auth.signOut();
                    onMode('local');
                  }}
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            ) : (
              <button className="button primary" onClick={login}>
                <LogIn size={16} />
                Sign in with Google
              </button>
            )}
          </div>
        ) : (
          <div className="notice mt-4 space-y-2">
            <p>
              Get the Project URL and publishable key from your Supabase project’s Connect dialog.
              Apply the SpendPulse migrations and configure Google sign-in for your owner email.
            </p>
            <p className="break-words">
              Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
              <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> in <code>.env.local</code> for local
              use, GitHub Actions variables for Pages, or Vercel environment variables. Rebuild,
              then sign in here.
            </p>
            <a
              className="text-link"
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
            >
              Open Supabase dashboard
            </a>
          </div>
        )}
        <p className="text-xs text-muted mt-4">
          Demo, local, and cloud ledgers are separate. Export and restore to move records
          deliberately.
        </p>
      </section>
      <section className="panel p-6">
        <h2>The way you like it</h2>
        <div className="summary-line mt-4">
          <span>Currency</span>
          <strong>₹ INR · Indian rupee</strong>
        </div>
        <div className="summary-line">
          <span>Calendar time zone</span>
          <strong>Asia/Kolkata</strong>
        </div>
        <div className="summary-line">
          <span>Appearance</span>
          <button
            className="button secondary"
            onClick={() => change({ theme: data.preferences.theme === 'dark' ? 'light' : 'dark' })}
          >
            {data.preferences.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {data.preferences.theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
        <label className="field mt-4">
          Voice language
          <select
            value={data.preferences.recognitionLanguage}
            onChange={(event) =>
              change({
                recognitionLanguage: event.target.value as Preferences['recognitionLanguage'],
              })
            }
          >
            <option value="en-IN">English (India) / Manglish</option>
            <option value="ml-IN">Malayalam (India)</option>
          </select>
        </label>
      </section>
      <section className="panel p-6">
        <h2>AI setup</h2>
        <p className="text-sm text-muted mt-3">
          Create a Gemini API key in Google AI Studio. In your Supabase project, deploy the
          <code> integrations</code> function and add the key as <code>GEMINI_API_KEY</code> under
          Edge Function Secrets. Set <code>ALLOWED_ORIGINS</code> to include this app’s origin.
        </p>
        <a
          className="text-link mt-3"
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
        >
          Open Google AI Studio
        </a>
        {mode === 'cloud' ? (
          <div className="mt-5 space-y-3">
            <label className="check-label">
              <input
                type="checkbox"
                checked={data.preferences.aiEnabled}
                onChange={(event) => change({ aiEnabled: event.target.checked })}
              />
              Enable AI assistance
            </label>
            <button className="button secondary" disabled={checkingAI} onClick={checkAI}>
              {checkingAI ? 'Checking…' : 'Check AI setup'}
            </button>
            {aiStatus && (
              <p className="notice" role="status">
                {aiStatus}
              </p>
            )}
          </div>
        ) : (
          <p className="notice mt-4">Open your cloud ledger to use and check Gemini.</p>
        )}
        <p className="text-xs text-muted mt-4">
          Choosing an AI action sends its selected content to Gemini. SpendPulse has no monthly AI
          cap. Google’s quotas and billing apply.
        </p>
      </section>
      <section className="panel p-6">
        <h2>Take your data with you</h2>
        <p className="text-sm text-muted mt-3">
          Back up transactions, categories, accounts, and your budget. Keep the file somewhere
          private.
        </p>
        <button
          className="button secondary mt-5"
          onClick={() =>
            downloadText(`spendpulse-backup-${today()}.json`, JSON.stringify(data, null, 2))
          }
        >
          <Download size={16} />
          Download JSON backup
        </button>
        <label className="field mt-5">
          Restore or merge a backup
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setError(null);
              setBusy(true);
              try {
                if (file.size > 20 * 1024 * 1024) throw new Error('Backup exceeds 20 MB.');
                const backup = backupSchema.parse(JSON.parse(await file.text()));
                if (
                  !window.confirm(
                    `Merge ${backup.transactions.length} entries and replace preferences in this ${mode} ledger?`,
                  )
                )
                  return;
                await onRestore(backup);
                setNotice('Backup restored. Existing transaction IDs were preserved.');
              } catch (error) {
                setError(error);
              } finally {
                setBusy(false);
                event.target.value = '';
              }
            }}
          />
        </label>
        {notice && <p className="notice mt-4">{notice}</p>}
      </section>
      <section className="panel settings-wide">
        <div className="panel-heading">
          <div>
            <h2>Categories with a little personality</h2>
            <p>Names, symbols, and colors that make sense to you</p>
          </div>
          <button
            className="button secondary"
            onClick={() => {
              setError(null);
              setEditing('new');
            }}
          >
            <Plus size={16} />
            Add category
          </button>
        </div>
        <div className="category-settings">
          {data.preferences.categories.map((category) => (
            <button
              key={category.id}
              onClick={() => {
                setError(null);
                setEditing(category);
              }}
            >
              <CategoryIcon category={category} />
              <span>
                {category.name}
                <small>{category.kind}</small>
              </span>
              <span className="text-muted ml-auto">↗</span>
            </button>
          ))}
        </div>
      </section>
      {!editing && <ErrorNotice error={error} />}
      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={category ? 'Make it yours' : 'Add a category'}
        >
          <form className="space-y-4 mt-6" onSubmit={saveCategory}>
            <label className="field">
              Name
              <input name="name" required maxLength={50} defaultValue={category?.name} />
            </label>
            <label className="field">
              Type
              <select name="kind" defaultValue={category?.kind || 'expense'} disabled={!!category}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              {category && <input type="hidden" name="kind" value={category.kind} />}
            </label>
            <label className="field">
              Symbol
              <select name="icon" defaultValue={category?.icon || 'wallet'}>
                {iconNames.map((icon) => (
                  <option key={icon} value={icon}>
                    {icon}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-3 text-accent">
              {Object.entries(icons).map(([name, Icon]) => (
                <span title={name} key={name}>
                  <Icon size={20} />
                </span>
              ))}
            </div>
            <label className="field">
              Color
              <input type="color" name="color" defaultValue={category?.color || '#c1ce82'} />
            </label>
            <ErrorNotice error={error} />
            <button className="button primary w-full" disabled={busy}>
              Save category
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
};
