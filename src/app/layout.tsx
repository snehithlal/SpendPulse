import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SpendPulse — A little clarity. A lot of possibility.',
  description:
    'Your personal money space. Track spending, income, budgets and bills, with or without AI.',
};
const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
};

export default RootLayout;
