import * as XLSX from 'xlsx';
self.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer }>) => {
  try {
    const workbook = XLSX.read(event.data.buffer, {
      type: 'array',
      cellDates: true,
      cellFormula: false,
      cellHTML: false,
      sheetRows: 10002,
    });
    const sheets = workbook.SheetNames.map((name) => {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
        header: 1,
        defval: '',
        raw: true,
      });
      if (rows.length > 10001)
        throw new Error('Maximum 10,000 data rows per sheet. Split this statement first.');
      return {
        name,
        rows: rows.map((row) =>
          row.map((cell) =>
            cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell),
          ),
        ),
      };
    });
    self.postMessage({ sheets });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Could not parse the spreadsheet.',
    });
  }
};
