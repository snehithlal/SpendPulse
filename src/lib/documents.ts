import type { Preferences, TransactionDraft } from './schema';
import { parseReceipt } from './parser';
import { toPaise } from './finance';

export type DocumentResult = {
  text: string;
  sheets: { name: string; rows: string[][] }[];
  preview?: string;
};
export type ColumnMapping = {
  date: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
};
export const fileHash = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};
export const readDocument = async (
  file: File,
  progress: (message: string) => void,
  password?: string,
  signal?: AbortSignal,
): Promise<DocumentResult> => {
  if (file.size > 20 * 1024 * 1024)
    throw new Error('Maximum file size is 20 MB. Split this document first.');
  const cancelled = () => {
    if (signal?.aborted) throw new Error('Import cancelled.');
  };
  cancelled();
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  if (['csv', 'xlsx', 'xls'].includes(extension || '')) {
    progress('Reading statement…');
    // Spreadsheet parsing is isolated from the UI thread, including untrusted inputs.
    const worker = new Worker(new URL('../workers/spreadsheet.ts', import.meta.url), {
      type: 'module',
    });
    return new Promise<DocumentResult>((resolve, reject) => {
      const abort = () => {
        worker.terminate();
        reject(new Error('Import cancelled.'));
      };
      signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = (
        event: MessageEvent<{ sheets?: DocumentResult['sheets']; error?: string }>,
      ) => {
        worker.terminate();
        signal?.removeEventListener('abort', abort);
        if (event.data.error) reject(new Error(event.data.error));
        else resolve({ text: '', sheets: event.data.sheets || [] });
      };
      worker.onerror = () => {
        worker.terminate();
        signal?.removeEventListener('abort', abort);
        reject(new Error('Could not read this spreadsheet. Export it as CSV and try again.'));
      };
      void file.arrayBuffer().then((buffer) => worker.postMessage({ buffer }, [buffer]));
    });
  }
  const recognize = async (image: File | string) => {
    const { createWorker } = await import('tesseract.js');
    cancelled();
    const worker = await createWorker('eng', 1, {
      logger: (event) => progress(`${event.status} ${Math.round(event.progress * 100)}%`),
    });
    const abort = () => {
      void worker.terminate();
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      cancelled();
      const result = await worker.recognize(image);
      return result.data.text;
    } finally {
      signal?.removeEventListener('abort', abort);
      await worker.terminate();
    }
  };
  if (extension === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/vendor/pdf.worker.min.mjs`;
    progress('Opening PDF…');
    const task = pdfjs.getDocument({ data: await file.arrayBuffer(), password });
    const abort = () => {
      void task.destroy();
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 50) throw new Error('Maximum 50 pages. Upload a smaller statement.');
      const pages: string[] = [];
      for (let index = 1; index <= pdf.numPages; index++) {
        cancelled();
        progress(`Reading page ${index} of ${pdf.numPages}…`);
        const page = await pdf.getPage(index);
        const content = await page.getTextContent();
        let text = content.items
          .map((item) => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : ''))
          .join('');
        if (text.trim().length < 30) {
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Your browser could not render this PDF.');
          await page.render({ canvasContext: context, viewport, canvas }).promise;
          text = await recognize(canvas.toDataURL('image/png'));
          canvas.width = 0;
          canvas.height = 0;
        }
        pages.push(text);
      }
      return { text: pages.join('\n\n'), sheets: [] };
    } finally {
      signal?.removeEventListener('abort', abort);
      await task.destroy();
    }
  }
  if (['jpg', 'jpeg', 'png', 'webp'].includes(extension || '')) {
    return { text: await recognize(file), sheets: [] };
  }
  throw new Error('Choose PDF, XLSX, XLS, CSV, JPG, PNG, or WebP.');
};

export const normalizeDate = (value: string): string | undefined => {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const indian = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (indian)
    return `${indian[3].length === 2 ? '20' : ''}${indian[3]}-${indian[2].padStart(2, '0')}-${indian[1].padStart(2, '0')}`;
  const named = value.match(/^(\d{1,2})[ -]([a-z]{3})[ -](\d{4})$/i);
  if (named) {
    const month =
      ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
        named[2].toLowerCase(),
      ) + 1;
    if (month) return `${named[3]}-${String(month).padStart(2, '0')}-${named[1].padStart(2, '0')}`;
  }
  return undefined;
};
export const guessMapping = (headers: string[]): ColumnMapping => ({
  date: headers.findIndex((value) => /date/i.test(value)),
  description: headers.findIndex((value) =>
    /description|particular|narration|merchant|details/i.test(value),
  ),
  amount: headers.findIndex((value) => /^amount|transaction amount/i.test(value)),
  debit: headers.findIndex((value) => /debit|withdrawal/i.test(value)),
  credit: headers.findIndex((value) => /credit|deposit/i.test(value)),
});
export const mapStatementRows = (rows: string[][], mapping: ColumnMapping): TransactionDraft[] =>
  rows
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => {
      const raw = row[mapping.amount] || '';
      const debit = toPaise((row[mapping.debit] || '').replace(/(?:INR|RS\.?|DR|CR)/gi, ''));
      const credit = toPaise((row[mapping.credit] || '').replace(/(?:INR|RS\.?|DR|CR)/gi, ''));
      const amount = toPaise(raw.replace(/(?:INR|RS\.?|DR|CR|[()\-+])/gi, ''));
      const incoming = credit > 0 || /cr|^\+/i.test(raw);
      return {
        date: normalizeDate(row[mapping.date] || ''),
        merchant: row[mapping.description]?.trim(),
        amountPaise:
          debit > 0 && credit > 0
            ? undefined
            : debit > 0
              ? debit
              : credit > 0
                ? credit
                : Number.isFinite(amount)
                  ? amount
                  : undefined,
        kind: incoming ? 'income' : 'expense',
        source: 'statement',
      };
    });
export const parseStatementText = (text: string, preferences: Preferences): TransactionDraft[] => {
  const lines = text.split('\n').filter((line) => /^\s*\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}/.test(line));
  return lines.map((line) => {
    const date = line.match(/^\s*([\d/.-]+)/)?.[1] || '';
    const tail = line.match(/([\d,]+\.\d{2})\s*(CR|DR)?\s*$/i);
    const monetaryValues = line.slice(date.length).match(/[\d,]+\.\d{2}/g) || [];
    const merchant = line.slice(line.indexOf(date) + date.length, tail?.index).trim();
    const draft = parseReceipt(merchant, preferences);
    return {
      ...draft,
      date: normalizeDate(date),
      merchant,
      amountPaise: tail && monetaryValues.length === 1 ? toPaise(tail[1]) : undefined,
      notes:
        monetaryValues.length > 1
          ? 'Multiple amounts on this line. Identify the transaction amount rather than the running balance.'
          : '',
      kind: tail?.[2]?.toUpperCase() === 'CR' ? ('income' as const) : ('expense' as const),
      source: 'statement' as const,
    };
  });
};
