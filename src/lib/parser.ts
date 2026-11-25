import { today, toPaise } from './finance';
import type { Preferences, TransactionDraft } from './schema';

const merchantRules: [RegExp, string, string][] = [
  [/swiggy|സ്വിഗ്ഗി/i, 'Swiggy', 'food'],
  [/zomato|സൊമാറ്റോ/i, 'Zomato', 'food'],
  [/zepto|സെപ്റ്റോ/i, 'Zepto', 'groceries'],
  [/blinkit/i, 'Blinkit', 'groceries'],
  [/instamart/i, 'Instamart', 'groceries'],
  [/amazon/i, 'Amazon', 'shopping'],
  [/flipkart/i, 'Flipkart', 'shopping'],
  [/uber/i, 'Uber', 'travel'],
  [/rapido/i, 'Rapido', 'travel'],
  [/netflix/i, 'Netflix', 'subscriptions'],
  [/spotify/i, 'Spotify', 'subscriptions'],
  [/indianoil|petrol|fuel/i, 'IndianOil', 'travel'],
];
export const parseEntry = (
  text: string,
  preferences: Preferences,
  referenceDate = today(),
): TransactionDraft => {
  const draft: TransactionDraft = { date: referenceDate, source: 'voice' };
  const amount =
    text.match(/(?:₹|rs\.?|inr|rupees?)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    text.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:rupees?|rs\.?|രൂപ)/i) ||
    text.match(
      /(?:spent|paid|received|salary|amount|total|ചെലവ്)\s*(?:of\s*)?([\d,]+(?:\.\d{1,2})?)/i,
    );
  if (amount) draft.amountPaise = toPaise(amount[1]);
  else {
    const withoutDates = text.replace(/\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/g, '');
    const numbers = withoutDates.match(/\b\d+(?:\.\d{1,2})?\b/g);
    if (numbers?.length === 1) draft.amountPaise = toPaise(numbers[0]);
  }
  if (/yesterday|innale|ഇന്നലെ/i.test(text)) {
    const date = new Date(`${referenceDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    draft.date = date.toISOString().slice(0, 10);
  }
  const explicitDate = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (explicitDate) draft.date = explicitDate[1];
  draft.kind = /refund|reversal/i.test(text)
    ? 'refund'
    : /salary|earned|income|received|credited|kitti|കിട്ടി/i.test(text)
      ? 'income'
      : 'expense';
  if (/salary/i.test(text)) {
    draft.merchant = 'Salary';
    draft.categoryId = 'salary';
  }
  for (const [pattern, merchant, category] of merchantRules) {
    if (pattern.test(text)) {
      draft.merchant = merchant;
      draft.categoryId = draft.kind === 'income' ? 'other-income' : category;
      break;
    }
  }
  const account = preferences.accounts.find(
    (account) =>
      (account.lastFour && text.includes(account.lastFour)) ||
      (account.id !== 'cash' &&
        text.toLowerCase().includes(account.name.split(' ')[0].toLowerCase())),
  );
  if (account) draft.accountId = account.id;
  if (/cash|ക്യാഷ്/i.test(text)) draft.accountId = 'cash';
  if (!draft.merchant) {
    const match = text.match(
      /(?:at|on|from|to)\s+([a-z][a-z\s&'-]+?)(?:\s+(?:using|with|yesterday|today|for)\b|$)/i,
    );
    if (match) draft.merchant = match[1].trim();
  }
  return draft;
};

export const parseReceipt = (text: string, preferences: Preferences): TransactionDraft => {
  const draft = parseEntry(text, preferences);
  draft.source = 'receipt';
  draft.kind = 'expense';
  // A subtotal is never silently promoted to the final payable amount.
  const totals = [
    ...text.matchAll(
      /(?:grand\s*total|net\s*(?:total|payable)|amount\s*(?:due|payable)|(?<!sub[ -]?)\btotal)\s*[:=₹\s]*(?:rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    ),
  ];
  const unique = [
    ...new Set(totals.map((match) => toPaise(match[1])).filter((amount) => amount > 0)),
  ];
  draft.amountPaise = unique.length === 1 ? unique[0] : undefined;
  draft.merchant ||= text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 2 && /[a-z]/i.test(line))
    ?.slice(0, 120);
  const date = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  draft.date = date
    ? `${date[3]}-${date[2].padStart(2, '0')}-${date[1].padStart(2, '0')}`
    : text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  return draft;
};
