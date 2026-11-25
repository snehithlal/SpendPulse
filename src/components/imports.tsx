'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, Check, FileUp, Mail, RotateCw, Scissors, Sparkles, Upload, X } from 'lucide-react';
import { ErrorNotice } from './ui';
import { TransactionEditor } from './transaction-editor';
import {
  fileHash,
  guessMapping,
  mapStatementRows,
  parseStatementText,
  readDocument,
  type ColumnMapping,
  type DocumentResult,
} from '@/lib/documents';
import { parseReceipt } from '@/lib/parser';
import { callIntegration, type StorageMode } from '@/lib/repository';
import { duplicateOf, today } from '@/lib/finance';
import {
  transactionSchema,
  type AppData,
  type Transaction,
  type TransactionDraft,
} from '@/lib/schema';

type Candidate = { id: string; draft: TransactionDraft; selected: boolean; sourceKey: string };
export const Imports = ({
  data,
  mode,
  onImport,
  onUndo,
  initialScan = false,
}: {
  data: AppData;
  mode: StorageMode;
  onImport: (entries: Transaction[]) => Promise<void>;
  onUndo: (id: string) => Promise<void>;
  initialScan?: boolean;
}) => {
  const [tab, setTab] = useState<'statement' | 'receipt' | 'gmail'>(
    initialScan ? 'receipt' : 'statement',
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [password, setPassword] = useState('');
  const [account, setAccount] = useState('axis');
  const [document, setDocument] = useState<DocumentResult | null>(null);
  const [sheet, setSheet] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({
    date: -1,
    description: -1,
    amount: -1,
    debit: -1,
    credit: -1,
  });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const [hash, setHash] = useState('');
  const abort = useRef<AbortController | null>(null);
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`);
  const [to, setTo] = useState(today());
  const [cursor, setCursor] = useState<string | null>(null);
  const [gmailQuery, setGmailQuery] = useState('');
  const [gmailUseAI, setGmailUseAI] = useState(false);
  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const updateCandidates = (drafts: TransactionDraft[], prefix: string) => {
    setCandidates(
      drafts.map((draft, index) => {
        const validCategory = data.preferences.categories.some(
          (category) =>
            category.id === draft.categoryId &&
            category.kind === (draft.kind === 'income' ? 'income' : 'expense'),
        );
        const validAccount = data.preferences.accounts.some(
          (account) => account.id === draft.accountId,
        );
        const value = {
          ...draft,
          accountId: validAccount ? draft.accountId : account,
          categoryId: validCategory
            ? draft.categoryId
            : draft.kind === 'income'
              ? 'other-income'
              : 'other',
        };
        const sourceKey = draft.sourceKey || `${prefix}:${index}`;
        const duplicate = duplicateOf(
          {
            date: draft.date || '',
            merchant: draft.merchant || '',
            amountPaise: draft.amountPaise || 0,
            kind: draft.kind || 'expense',
            sourceKey,
          },
          data.transactions,
        );
        return { id: crypto.randomUUID(), draft: value, selected: !duplicate, sourceKey };
      }),
    );
  };
  const pickFile = (value: File | undefined) => {
    if (!value) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(value);
    setPreview(value.type.startsWith('image/') ? URL.createObjectURL(value) : '');
    setDocument(null);
    setCandidates([]);
    setNotice('');
    setPassword('');
    setError(null);
  };
  const transformImage = async (crop: boolean) => {
    if (!file || !preview) return;
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = window.document.createElement('canvas');
      const width = crop ? Math.round(bitmap.width * 0.8) : bitmap.height;
      const height = crop ? Math.round(bitmap.height * 0.8) : bitmap.width;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return;
      if (crop)
        context.drawImage(
          bitmap,
          bitmap.width * 0.1,
          bitmap.height * 0.1,
          width,
          height,
          0,
          0,
          width,
          height,
        );
      else {
        context.translate(width / 2, height / 2);
        context.rotate(Math.PI / 2);
        context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      }
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) pickFile(new File([blob], 'receipt.png', { type: 'image/png' }));
    } catch (error) {
      setError(error);
    }
  };
  const extract = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setNotice('');
    abort.current = new AbortController();
    try {
      const fingerprint = await fileHash(file);
      setHash(fingerprint);
      const result = await readDocument(
        file,
        setProgress,
        password || undefined,
        abort.current.signal,
      );
      setDocument(result);
      setPassword('');
      if (result.sheets.length) {
        setSheet(0);
        setHeaderRow(0);
        const saved = localStorage.getItem(`spendpulse:mapping:${account}`);
        const suggested = guessMapping(result.sheets[0].rows[0] || []);
        const chosen = saved
          ? ({ ...suggested, ...JSON.parse(saved) } as ColumnMapping)
          : suggested;
        setMapping(chosen);
        updateCandidates(
          mapStatementRows(result.sheets[0].rows.slice(1), chosen),
          `${fingerprint}:0`,
        );
      } else
        updateCandidates(
          tab === 'receipt'
            ? [parseReceipt(result.text, data.preferences)]
            : parseStatementText(result.text, data.preferences),
          fingerprint,
        );
      setProgress('');
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  };
  const aiExtract = async () => {
    if (!document) return;
    setBusy(true);
    setError(null);
    try {
      let image: string | undefined;
      if (file?.type.startsWith('image/')) {
        const bitmap = await createImageBitmap(file);
        const canvas = window.document.createElement('canvas');
        const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      }
      const result = await callIntegration('parse', {
        text: document.text || JSON.stringify(document.sheets[sheet]?.rows),
        source: tab === 'receipt' ? 'receipt' : 'statement',
        image,
      });
      updateCandidates(result.drafts || [], hash);
      setNotice('AI suggestions ready. Check every amount before saving.');
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  };
  const sync = async () => {
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const result = await callIntegration('gmail-sync', {
        from,
        to,
        cursor,
        query: gmailQuery,
        useAI: gmailUseAI && data.preferences.aiEnabled,
      });
      updateCandidates(result.drafts || [], 'gmail');
      setCursor(result.nextPageToken || null);
      setNotice(
        `${result.processed || 0} messages checked. ${result.unresolved || 0} could not be parsed.${result.nextPageToken ? ' Review and save this batch, then load the next.' : ''} ${result.aiWarning || ''}`,
      );
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const importId = crypto.randomUUID();
      const selected = candidates.filter((row) => row.selected);
      if (!selected.length) throw new Error('Select at least one entry.');
      const entries = selected.map((row) =>
        transactionSchema.parse({
          ...row.draft,
          id: row.id,
          amountPaise: row.draft.amountPaise,
          personalSharePaise: row.draft.amountPaise,
          kind: row.draft.kind || 'expense',
          excluded: false,
          settledPaise: 0,
          linkedTransactionId: null,
          source: row.draft.source || (tab === 'gmail' ? 'gmail' : tab),
          sourceKey: row.sourceKey,
          importId,
          notes: row.draft.notes || '',
          createdAt: new Date().toISOString(),
        }),
      );
      await onImport(entries);
      setCandidates([]);
      setNotice(`${entries.length} transactions saved. You can undo this batch below.`);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  };
  const headers = document?.sheets[sheet]?.rows[headerRow] || [];
  const selectedCandidate = candidates.find((row) => row.id === editing);
  const imports = [
    ...new Set(data.transactions.map((entry) => entry.importId).filter((id): id is string => !!id)),
  ];
  return (
    <div className="space-y-6">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Less typing. More living.</h2>
            <p>Bring your statements, bills, and bank alerts together.</p>
          </div>
          <FileUp size={24} className="text-accent" />
        </div>
        <div className="px-6 pb-6 space-y-5">
          <div className="segmented">
            {(
              [
                { id: 'statement', label: 'Statement', Icon: Upload },
                { id: 'receipt', label: 'Scan bill', Icon: Camera },
                { id: 'gmail', label: 'Gmail', Icon: Mail },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                className={tab === id ? 'active' : ''}
                onClick={() => {
                  setTab(id);
                  setCandidates([]);
                  setDocument(null);
                  setNotice('');
                  setError(null);
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
          {tab !== 'gmail' ? (
            <>
              <label className="upload-zone">
                <FileUp size={34} strokeWidth={1.3} />
                <strong>
                  {tab === 'receipt' ? 'A photo is all it takes' : 'Drop in your monthly statement'}
                </strong>
                <span>
                  {tab === 'receipt'
                    ? 'Take a photo or choose a bill · JPG, PNG, WebP, PDF'
                    : 'PDF, Excel, or CSV · up to 20 MB'}
                </span>
                <input
                  type="file"
                  aria-label={tab === 'receipt' ? 'Upload bill' : 'Upload statement'}
                  accept={
                    tab === 'receipt'
                      ? 'image/jpeg,image/png,image/webp,application/pdf'
                      : '.pdf,.xlsx,.xls,.csv'
                  }
                  onChange={(event) => pickFile(event.target.files?.[0])}
                />
                <small>{file?.name || 'Choose a file'}</small>
              </label>
              {tab === 'receipt' && (
                <label className="button secondary w-fit cursor-pointer">
                  <Camera size={17} />
                  Open camera
                  <input
                    type="file"
                    className="sr-only"
                    aria-label="Scan bill with camera"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) => pickFile(event.target.files?.[0])}
                  />
                </label>
              )}
              {preview && (
                <div className="receipt-preview">
                  <img src={preview} alt="Selected bill preview" />
                  <div className="flex gap-2 mt-3">
                    <button className="button secondary" onClick={() => transformImage(false)}>
                      <RotateCw size={15} />
                      Rotate
                    </button>
                    <button className="button secondary" onClick={() => transformImage(true)}>
                      <Scissors size={15} />
                      Trim edges 10%
                    </button>
                    <span className="text-xs text-muted self-center">
                      Choose the original again to reset.
                    </span>
                  </div>
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="field">
                  Payment account
                  <select value={account} onChange={(event) => setAccount(event.target.value)}>
                    {data.preferences.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                {file?.name.toLowerCase().endsWith('.pdf') && (
                  <label className="field">
                    PDF password (if protected)
                    <input
                      type="password"
                      autoComplete="off"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <small className="text-muted">Used in your browser. Never stored.</small>
                  </label>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="button primary" disabled={!file || busy} onClick={extract}>
                  <FileUp size={16} />
                  {busy ? progress || 'Processing…' : 'Extract with rules'}
                </button>
                {document && data.preferences.aiEnabled && mode === 'cloud' && (
                  <button className="button secondary" disabled={busy} onClick={aiExtract}>
                    <Sparkles size={16} />
                    Try AI extraction
                  </button>
                )}
                {busy && (
                  <button className="button secondary" onClick={() => abort.current?.abort()}>
                    <X size={15} />
                    Cancel local extraction
                  </button>
                )}
              </div>
              <p className="text-xs text-muted">
                Files stay on this device during local extraction. Original files are not saved. AI
                extraction sends content to your configured provider only when you choose it.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">
                Connect read-only Gmail access to import bank alerts and receipts. Your Gmail
                connection is separate from your login.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  className="button secondary"
                  disabled={mode !== 'cloud' || busy}
                  onClick={async () => {
                    try {
                      const result = await callIntegration('gmail-connect');
                      window.location.assign(result.url);
                    } catch (error) {
                      setError(error);
                    }
                  }}
                >
                  <Mail size={16} />
                  Connect Gmail
                </button>
                <button
                  className="text-link"
                  disabled={mode !== 'cloud' || busy}
                  onClick={async () => {
                    try {
                      await callIntegration('gmail-disconnect');
                      setNotice('Gmail disconnected.');
                    } catch (error) {
                      setError(error);
                    }
                  }}
                >
                  Disconnect
                </button>
              </div>
              {mode !== 'cloud' && (
                <p className="notice">
                  Sign in with Google in Settings to use Gmail. Local statement uploads work without
                  an account.
                </p>
              )}
              <div className="grid grid-cols-2 gap-4">
                <label className="field">
                  From
                  <input
                    type="date"
                    value={from}
                    onChange={(event) => {
                      setFrom(event.target.value);
                      setCursor(null);
                    }}
                  />
                </label>
                <label className="field">
                  Through
                  <input
                    type="date"
                    value={to}
                    onChange={(event) => {
                      setTo(event.target.value);
                      setCursor(null);
                    }}
                  />
                </label>
              </div>
              <label className="field">
                Optional Gmail filter
                <input
                  value={gmailQuery}
                  onChange={(event) => {
                    setGmailQuery(event.target.value);
                    setCursor(null);
                  }}
                  placeholder="from:alerts@axis.bank.in"
                />
                <small className="text-muted">
                  Leave blank for the built-in bank and merchant filter.
                </small>
              </label>
              {mode === 'cloud' && data.preferences.aiEnabled && (
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={gmailUseAI}
                    disabled={busy}
                    onChange={(event) => setGmailUseAI(event.target.checked)}
                  />
                  Send alerts that rules could not parse to Gemini
                </label>
              )}
              <button
                className="button primary"
                disabled={mode !== 'cloud' || busy || candidates.some((row) => row.selected)}
                onClick={sync}
              >
                {busy ? 'Checking messages…' : cursor ? 'Load next batch' : 'Sync emails'}
              </button>
            </>
          )}
          <ErrorNotice error={error} />
          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
        </div>
      </section>
      {document && document.sheets.length > 0 && (
        <section className="panel p-6">
          <h2>Map your statement</h2>
          <p className="text-sm text-muted mt-2">
            Check the header row and columns. Credits may be refunds or repayments; correct the type
            in the preview.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <label className="field">
              Sheet
              <select
                value={sheet}
                onChange={(event) => {
                  const index = Number(event.target.value);
                  setSheet(index);
                  setHeaderRow(0);
                  setMapping(guessMapping(document.sheets[index].rows[0] || []));
                }}
              >
                {document.sheets.map((sheet, index) => (
                  <option key={sheet.name} value={index}>
                    {sheet.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Header row (1-based)
              <input
                type="number"
                min="1"
                max={document.sheets[sheet].rows.length}
                value={headerRow + 1}
                onChange={(event) => {
                  const index = Math.max(0, Number(event.target.value) - 1);
                  setHeaderRow(index);
                  setMapping(guessMapping(document.sheets[sheet].rows[index] || []));
                }}
              />
            </label>
            {Object.entries(mapping).map(([key, value]) => (
              <label className="field" key={key}>
                {key}
                <select
                  value={value}
                  onChange={(event) =>
                    setMapping({ ...mapping, [key]: Number(event.target.value) })
                  }
                >
                  <option value={-1}>Not present</option>
                  {headers.map((header, index) => (
                    <option key={index} value={index}>
                      {index + 1}. {header || 'Unnamed'}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            className="button secondary mt-4"
            onClick={() => {
              localStorage.setItem(`spendpulse:mapping:${account}`, JSON.stringify(mapping));
              updateCandidates(
                mapStatementRows(document.sheets[sheet].rows.slice(headerRow + 1), mapping),
                `${hash}:${sheet}`,
              );
            }}
          >
            Apply mapping & remember
          </button>
        </section>
      )}
      {document?.text && (
        <details className="panel p-5">
          <summary className="cursor-pointer text-sm">Review extracted text</summary>
          <pre className="extracted-text mt-4">{document.text}</pre>
        </details>
      )}
      {document && candidates.length === 0 && !notice && (
        <p className="notice">
          No transaction rows recognized. Review the extracted text; try AI if enabled, or add
          entries manually.
        </p>
      )}
      {candidates.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Check before it counts</h2>
              <p>
                {candidates.filter((row) => row.selected).length} selected · click a row to edit
                missing details
              </p>
            </div>
            <button className="button primary" disabled={busy} onClick={save}>
              <Check size={16} />
              Save selected
            </button>
          </div>
          <div className="px-6 pb-6 space-y-2">
            {candidates.map((row) => {
              const valid = !!row.draft.date && !!row.draft.amountPaise && !!row.draft.merchant;
              const duplicate = duplicateOf(
                {
                  date: row.draft.date || '',
                  merchant: row.draft.merchant || '',
                  amountPaise: row.draft.amountPaise || 0,
                  kind: row.draft.kind || 'expense',
                  sourceKey: row.sourceKey,
                },
                data.transactions,
              );
              return (
                <div key={row.id} className="import-row">
                  <input
                    aria-label={`Select ${row.draft.merchant || 'entry'}`}
                    type="checkbox"
                    checked={row.selected}
                    disabled={!!duplicate?.exact}
                    onChange={(event) =>
                      setCandidates(
                        candidates.map((entry) =>
                          entry.id === row.id
                            ? { ...entry, selected: event.target.checked }
                            : entry,
                        ),
                      )
                    }
                  />
                  <button onClick={() => setEditing(row.id)} className="flex-1 text-left">
                    <strong className="text-sm">
                      {row.draft.merchant || 'Missing description'}
                    </strong>
                    <small className="block text-muted">
                      {row.draft.date || 'Missing date'} · {row.draft.kind}{' '}
                      {duplicate
                        ? `· ${duplicate.exact ? 'Already imported' : 'Possible duplicate — deselected'}`
                        : !valid
                          ? '· Needs review'
                          : ''}
                    </small>
                  </button>
                  <span>
                    ₹
                    {row.draft.amountPaise
                      ? (row.draft.amountPaise / 100).toLocaleString('en-IN')
                      : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {imports.length > 0 && (
        <section className="panel p-6">
          <h2>Import history</h2>
          {imports
            .slice(-8)
            .reverse()
            .map((id) => {
              const entries = data.transactions.filter((entry) => entry.importId === id);
              return (
                <div key={id} className="summary-line">
                  <span>
                    {entries[0]?.source} · {entries.length} entries
                    <small className="block text-muted">{entries[0]?.createdAt.slice(0, 10)}</small>
                  </span>
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          `Remove the ${entries.length} entries created by this import?`,
                        )
                      )
                        return;
                      try {
                        await onUndo(id);
                        setNotice('Import undone.');
                      } catch (error) {
                        setError(error);
                      }
                    }}
                  >
                    Undo import
                  </button>
                </div>
              );
            })}
        </section>
      )}
      {selectedCandidate && (
        <TransactionEditor
          data={data}
          draft={selectedCandidate.draft}
          onClose={() => setEditing(null)}
          onSave={async (entry) => {
            setCandidates(
              candidates.map((row) =>
                row.id === selectedCandidate.id ? { ...row, draft: entry } : row,
              ),
            );
          }}
        />
      )}
    </div>
  );
};
