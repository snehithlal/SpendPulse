import { z } from 'zod';

export const moneySchema = z.number().int().min(0).max(100_000_000_000);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, 'Enter a real calendar date');
export const iconNames = [
  'utensils',
  'shopping',
  'home',
  'car',
  'plane',
  'heart',
  'users',
  'repeat',
  'wallet',
  'briefcase',
  'gift',
  'coffee',
  'fuel',
  'graduation',
  'sparkles',
] as const;
export const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(50),
  icon: z.enum(iconNames),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  kind: z.enum(['expense', 'income']),
});
export const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  lastFour: z.string().regex(/^\d{0,4}$/),
  type: z.enum(['bank', 'card', 'cash']),
  billingDay: z.number().int().min(1).max(31).nullable(),
  milestonePaise: moneySchema,
  milestonePeriod: z.enum(['month', 'quarter']),
});
export const transactionSchema = z
  .object({
    id: z.string().uuid(),
    date: dateSchema,
    merchant: z.string().trim().min(1, 'Enter a merchant or income source').max(120),
    amountPaise: moneySchema.refine((value) => value > 0, 'Amount must be greater than zero'),
    kind: z.enum(['expense', 'income', 'refund', 'transfer', 'reimbursement']),
    categoryId: z.string().min(1),
    accountId: z.string().min(1),
    notes: z.string().max(1000).default(''),
    excluded: z.boolean().default(false),
    personalSharePaise: moneySchema,
    settledPaise: moneySchema.default(0),
    linkedTransactionId: z.string().uuid().nullable().default(null),
    source: z.enum(['manual', 'voice', 'statement', 'receipt', 'gmail']),
    sourceKey: z.string().max(250).nullable().default(null),
    importId: z.string().nullable().default(null),
    createdAt: z.string().datetime(),
  })
  .superRefine((value, ctx) => {
    if (value.personalSharePaise > value.amountPaise)
      ctx.addIssue({
        code: 'custom',
        path: ['personalSharePaise'],
        message: 'Your share cannot exceed the total',
      });
    if (value.settledPaise > value.amountPaise - value.personalSharePaise)
      ctx.addIssue({
        code: 'custom',
        path: ['settledPaise'],
        message: 'Settlement cannot exceed what friends owe',
      });
    if (value.linkedTransactionId === value.id)
      ctx.addIssue({
        code: 'custom',
        path: ['linkedTransactionId'],
        message: 'An entry cannot link to itself',
      });
  });
export const rewardRuleSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string(),
  merchant: z.string().trim().min(1),
  ratePercent: z.number().min(0).max(100),
  capPaise: moneySchema,
  minSpendPaise: moneySchema,
  feePaise: moneySchema,
  sourceUrl: z.string().url(),
  verifiedOn: dateSchema,
  enabled: z.boolean(),
});
export const preferencesSchema = z.object({
  categories: z.array(categorySchema).min(1),
  accounts: z.array(accountSchema).min(1),
  budgets: z.record(z.string(), moneySchema),
  budgetAccounts: z.record(z.string(), z.string()),
  plannedIncomePaise: moneySchema,
  aiEnabled: z.boolean(),
  recognitionLanguage: z.enum(['en-IN', 'ml-IN']),
  theme: z.enum(['dark', 'light']),
  rewardRules: z.array(rewardRuleSchema),
});
export const backupSchema = z.object({
  version: z.literal(1),
  transactions: z.array(transactionSchema),
  preferences: preferencesSchema,
});
export type Transaction = z.infer<typeof transactionSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Account = z.infer<typeof accountSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type RewardRule = z.infer<typeof rewardRuleSchema>;
export type AppData = z.infer<typeof backupSchema>;
export type TransactionDraft = Partial<
  Pick<
    Transaction,
    | 'date'
    | 'merchant'
    | 'amountPaise'
    | 'categoryId'
    | 'accountId'
    | 'notes'
    | 'kind'
    | 'source'
    | 'sourceKey'
  >
>;
