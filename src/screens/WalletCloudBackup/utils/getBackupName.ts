import { formatPasskeyDate } from '@/utils/dateFormatter';

export const getBackupName = (date: Date, locale: Locale) => `Astellr Wallet - ${formatPasskeyDate(date, locale)}`;
