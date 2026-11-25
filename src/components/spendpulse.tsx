'use client';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CreditCard,
  FileUp,
  LayoutDashboard,
  ListFilter,
  Menu,
  Mic,
  Plus,
  ScanLine,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { Overview } from './overview';
import { Ledger } from './ledger';
import { SpendingCalendar } from './calendar';
import { Budget } from './budget';
import { Wallet } from './wallet';
import { Imports } from './imports';
import { Settings } from './settings';
import { Insights } from './insights';
import { TransactionEditor } from './transaction-editor';
import { ErrorNotice, cn } from './ui';
import { useFinance } from '@/hooks/use-finance';
import { monthLabel, shiftMonth, today } from '@/lib/finance';
import { supabase, type StorageMode } from '@/lib/repository';
import type { Transaction, TransactionDraft } from '@/lib/schema';

const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ListFilter },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'budget', label: 'Budget planner', icon: Target },
  { id: 'wallet', label: 'My wallet', icon: CreditCard },
  { id: 'imports', label: 'Import & scan', icon: FileUp },
  { id: 'insights', label: 'Insights', icon: Sparkles },
];
const pageTitles: Record<string, [string, string]> = {
  overview: ['Overview', 'Track your spending, income, and savings.'],
  transactions: ['Transactions', 'Search, edit, and export your ledger.'],
  calendar: ['Spending calendar', 'Select a day to see its expenses and income.'],
  budget: ['Budget planner', 'Set monthly targets and track actual spending.'],
  wallet: ['My wallet', 'Manage payment accounts and card rewards.'],
  imports: ['Import & scan', 'Review entries from statements, receipts, and Gmail.'],
  insights: ['Insights', 'Spot spending patterns and follow up on unsettled bills.'],
  settings: ['Settings', 'Manage appearance, categories, and connections.'],
};

const App = () => {
  const client = useQueryClient();
  const [mode, setMode] = useState<StorageMode>('demo');
  const [ready, setReady] = useState(false);
  const [view, setView] = useState('overview');
  const [month, setMonth] = useState(today().slice(0, 7));
  const [email, setEmail] = useState<string>();
  const [menu, setMenu] = useState(false);
  const [scan, setScan] = useState(false);
  const [editor, setEditor] = useState<{
    initial?: Transaction;
    draft?: TransactionDraft;
    voice?: boolean;
  } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const finance = useFinance(mode);
  const data = finance.data;
  useEffect(() => {
    const saved = localStorage.getItem('spendpulse:mode');
    if (saved === 'local' || saved === 'demo' || (saved === 'cloud' && supabase)) setMode(saved);
    setReady(true);
    const hash = window.location.hash.slice(1);
    if (pageTitles[hash]) setView(hash);
    if (!supabase) return;
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      setEmail(session?.user.email);
      if (
        session &&
        (event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && saved === 'cloud'))
      ) {
        setMode('cloud');
        localStorage.setItem('spendpulse:mode', 'cloud');
      }
      if (event === 'SIGNED_OUT') {
        client.removeQueries({ queryKey: ['finance', 'cloud'] });
        setMode('local');
        localStorage.setItem('spendpulse:mode', 'local');
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, [client]);
  useEffect(() => {
    if (data) window.document.documentElement.dataset.theme = data.preferences.theme;
  }, [data]);
  const navigate = (target: string) => {
    setView(target);
    setMenu(false);
    setError(null);
    history.replaceState(null, '', `${location.pathname}${location.search}#${target}`);
  };
  const changeMode = (value: StorageMode) => {
    setMode(value);
    localStorage.setItem('spendpulse:mode', value);
    setError(null);
  };
  const edit = (entry: Transaction) => setEditor({ initial: entry });
  const remove = async (entry: Transaction) => {
    if (!window.confirm(`Delete “${entry.merchant}”? This cannot be undone.`)) return;
    try {
      await finance.mutate({ type: 'delete', id: entry.id });
    } catch (error) {
      setError(error);
    }
  };
  const title = pageTitles[view] || pageTitles.overview;
  return (
    <div className="app-shell">
      <aside className={cn('sidebar', menu && 'is-open')}>
        <button className="brand" onClick={() => navigate('overview')}>
          <span className="brand-mark" aria-hidden="true">
            <Activity size={21} strokeWidth={2.25} />
          </span>
          <span>SpendPulse</span>
        </button>
        <button
          className="mobile-close icon-button"
          aria-label="Close menu"
          onClick={() => setMenu(false)}
        >
          <X size={20} />
        </button>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={cn('nav-item', view === id && 'active')}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={19} strokeWidth={1.6} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={cn('nav-item', view === 'settings' && 'active')}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={19} strokeWidth={1.6} />
            Settings
          </button>
          <button className="nav-item" onClick={() => navigate('settings')}>
            <CircleHelp size={19} strokeWidth={1.6} />
            Data & connections
          </button>
          <div className="profile">
            <span>{email ? email[0].toUpperCase() : 'S'}</span>
            <div>
              <strong>{mode === 'demo' ? 'Demo ledger' : 'Personal ledger'}</strong>
              <small>
                {mode === 'cloud'
                  ? email
                  : mode === 'demo'
                    ? 'Sample data'
                    : 'Stored on this device'}
              </small>
            </div>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              My space <span>/</span>{' '}
              <strong>
                {view === 'settings'
                  ? 'Settings'
                  : navigation.find((item) => item.id === view)?.label}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="private-badge">
              <ShieldCheck size={14} />
              {mode === 'demo'
                ? 'Demo data'
                : mode === 'cloud'
                  ? 'Private cloud'
                  : 'On this device'}
            </span>
            <span className="ai-badge">
              <span
                className={cn(
                  'tiny-dot',
                  data?.preferences.aiEnabled && mode === 'cloud' && 'enabled',
                )}
              />
              AI {data?.preferences.aiEnabled && mode === 'cloud' ? 'optional' : 'off'}
            </span>
          </div>
        </header>
        <main>
          <div className="page-intro">
            <div>
              <h1>{title[0]}</h1>
              <p>{title[1]}</p>
            </div>
            <div className="intro-actions">
              <button className="button secondary" onClick={() => setEditor({ voice: true })}>
                <Mic size={16} />
                <span>Speak</span>
              </button>
              <button className="button primary" onClick={() => setEditor({})}>
                <Plus size={17} />
                Add entry
              </button>
            </div>
          </div>
          <div className="page-toolbar">
            <div className="month-picker">
              <button aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
                <ChevronLeft size={17} />
              </button>
              <label>
                <CalendarDays size={15} />
                <span>{monthLabel(month)}</span>
                <input
                  aria-label="Reporting month"
                  type="month"
                  value={month}
                  onChange={(event) => {
                    if (event.target.value) setMonth(event.target.value);
                  }}
                />
              </label>
              <button aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
                <ChevronRight size={17} />
              </button>
            </div>
            <div className="quick-actions">
              <button
                onClick={() => setEditor({ draft: { kind: 'income', categoryId: 'salary' } })}
              >
                <ArrowDownLeft size={15} />
                Add income
              </button>
              <button
                onClick={() => {
                  setScan(true);
                  navigate('imports');
                }}
              >
                <ScanLine size={15} />
                Scan a bill
              </button>
            </div>
          </div>
          {mode === 'demo' && (
            <div className="demo-notice">
              <span>You’re viewing sample transactions.</span>
              <button onClick={() => changeMode('local')}>
                Start my ledger <ArrowUpRight size={14} />
              </button>
            </div>
          )}
          <ErrorNotice error={error || finance.error} />
          {!ready || finance.isLoading ? (
            <div className="loading-state">
              <div className="loading-pulse" />
              <p>Loading ledger…</p>
            </div>
          ) : data ? (
            <>
              {view === 'overview' && (
                <Overview data={data} month={month} onEdit={edit} onNavigate={navigate} />
              )}
              {view === 'transactions' && (
                <Ledger data={data} month={month} onEdit={edit} onDelete={remove} />
              )}
              {view === 'calendar' && (
                <SpendingCalendar
                  key={month}
                  data={data}
                  month={month}
                  onEdit={edit}
                  onAdd={(date) => setEditor({ draft: { date } })}
                />
              )}
              {view === 'budget' && (
                <Budget
                  key={`${mode}-${month}`}
                  data={data}
                  month={month}
                  onSave={async (value) => {
                    await finance.mutate({ type: 'preferences', value });
                  }}
                />
              )}
              {view === 'wallet' && (
                <Wallet
                  data={data}
                  month={month}
                  onSave={async (value) => {
                    await finance.mutate({ type: 'preferences', value });
                  }}
                />
              )}
              {view === 'imports' && (
                <Imports
                  key={`${mode}-${scan}`}
                  data={data}
                  mode={mode}
                  initialScan={scan}
                  onImport={async (value) => {
                    await finance.mutate({ type: 'import', value });
                  }}
                  onUndo={async (id) => {
                    await finance.mutate({ type: 'undo', id });
                  }}
                />
              )}
              {view === 'insights' && (
                <Insights key={month} data={data} month={month} mode={mode} onEdit={edit} />
              )}
              {view === 'settings' && (
                <Settings
                  data={data}
                  mode={mode}
                  email={email}
                  onMode={changeMode}
                  onSave={async (value) => {
                    await finance.mutate({ type: 'preferences', value });
                  }}
                  onRestore={async (backup) => {
                    await finance.mutate({ type: 'import', value: backup.transactions });
                    await finance.mutate({ type: 'preferences', value: backup.preferences });
                  }}
                />
              )}
              {editor && (
                <TransactionEditor
                  allowAI={mode === 'cloud'}
                  key={editor.initial?.id || JSON.stringify(editor)}
                  data={data}
                  {...editor}
                  onClose={() => setEditor(null)}
                  onSave={async (value) => {
                    await finance.mutate({ type: 'save', value });
                  }}
                />
              )}
            </>
          ) : (
            <button
              className="button secondary mt-5"
              onClick={() => {
                changeMode('local');
                navigate('settings');
              }}
            >
              Open local ledger & settings
            </button>
          )}
        </main>
      </div>
    </div>
  );
};

const SpendPulse = () => {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false }, mutations: { retry: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
};
export default SpendPulse;
