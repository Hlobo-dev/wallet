export const DEFAULT_ACCOUNT_NAME = 'Accounts';
export const DEFAULT_ACCOUNT_NUMBER = 0;
export const getAccountName = (accountNumber: number) => `${DEFAULT_ACCOUNT_NAME} ${String(accountNumber + 1).padStart(2, '0')}`;

/** Replace legacy "Wallet" prefix with "Accounts" for display, and strip trailing numbers. */
export const normalizeAccountName = (name: string | undefined): string =>
  (name || DEFAULT_ACCOUNT_NAME).replace(/^Wallet(?=\s|$)/, DEFAULT_ACCOUNT_NAME).replace(/\s+\d+$/, '');
