import { test, expect, type Page } from '@playwright/test';

const navigate = async (page: Page, label: string) => {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click();
};
test('manual income and expenses persist; edits update the calendar without AI', async ({
  page,
}) => {
  const aiRequests: string[] = [];
  page.on('request', (request) => {
    if (/generativelanguage|functions\/v1/.test(request.url())) aiRequests.push(request.url());
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Start my ledger' }).click();
  await page.getByRole('button', { name: 'Add income', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount', { exact: true }).fill('50000');
  await dialog.getByLabel('Income source').fill('Test salary');
  await dialog.getByRole('button', { name: 'Add income', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Add entry', exact: true }).click();
  await dialog.getByLabel('Amount', { exact: true }).fill('350.50');
  await dialog.getByLabel('Merchant / description').fill('Test lunch');
  await dialog.getByRole('button', { name: 'Add expense', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await navigate(page, 'Transactions');
  await expect(page.getByText('Test lunch', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Test lunch', exact: true }).click();
  await dialog.getByLabel('Amount', { exact: true }).fill('400');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByText('Test lunch', { exact: true })).toBeVisible();
  await navigate(page, 'Calendar');
  await expect(page.getByRole('button', { name: /spent ₹400, income ₹50,000/ })).toBeVisible();
  expect(aiRequests).toEqual([]);
});
test('statement CSV imports and repeat imports are deselected', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Start my ledger' }).click();
  await navigate(page, 'Import & scan');
  const csv = 'Date,Description,Amount\n25/11/2026,Fixture merchant,275.50\n';
  await page
    .getByLabel('Upload statement')
    .setInputFiles({ name: 'fixture.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Extract with rules' }).click();
  await expect(page.getByText('Check before it counts')).toBeVisible();
  await page.getByRole('button', { name: 'Save selected' }).click();
  await expect(page.getByText('1 transactions saved.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Extract with rules' }).click();
  await expect(page.getByLabel('Select Fixture merchant')).not.toBeChecked();
  await expect(page.getByLabel('Select Fixture merchant')).toBeDisabled();
});
test('demo dashboard and mobile layout remain usable', async ({ page }, testInfo) => {
  await page.goto('./');
  await expect(page.getByText('Personal spending', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-overview.png`,
    fullPage: true,
  });
});
