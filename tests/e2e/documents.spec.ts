import { test, expect } from '@playwright/test';

const syntheticPdf = () => {
  const content =
    'BT /F1 16 Tf 50 750 Td (Synthetic card statement) Tj 0 -30 Td (25/11/2026 Fixture Cafe 105.00) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n `)
    .join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(pdf);
};

test('text PDF produces an editable statement preview', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Start my ledger' }).click();
  if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Import & scan' }).click();
  await page
    .getByLabel('Upload statement')
    .setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: syntheticPdf() });
  await page.getByRole('button', { name: 'Extract with rules' }).click();
  await expect(page.getByText('Fixture Cafe', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save selected' }).click();
  await expect(page.getByText('1 transactions saved.', { exact: false })).toBeVisible();
});

test('bill photo OCR extracts a total without generative AI', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile',
    'OCR engine is exercised once; mobile file-input layout is covered separately.',
  );
  test.setTimeout(90000);
  await page.goto('./');
  await page.getByRole('button', { name: 'Start my ledger' }).click();
  await page.getByRole('button', { name: 'Scan a bill', exact: true }).click();
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 700;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'white';
    context.fillRect(0, 0, 1000, 700);
    context.fillStyle = 'black';
    context.font = '40px Arial';
    ['SPENDPULSE CAFE', '25/11/2026', 'Coffee 100.00', 'Tax 5.00', 'Grand total 105.00'].forEach(
      (line, index) => {
        context.fillText(line, 80, 100 + index * 100);
      },
    );
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const aiRequests: string[] = [];
  page.on('request', (request) => {
    if (/generativelanguage|functions\/v1/.test(request.url())) aiRequests.push(request.url());
  });
  await page.getByLabel('Upload bill').setInputFiles({
    name: 'synthetic-bill.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  });
  await page.getByRole('button', { name: 'Extract with rules' }).click();
  await expect(page.getByText('Check before it counts')).toBeVisible({ timeout: 70000 });
  await expect(page.getByText('₹105', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save selected' }).click();
  await expect(page.getByText('1 transactions saved.', { exact: false })).toBeVisible();
  expect(aiRequests).toEqual([]);
});
