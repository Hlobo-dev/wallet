import { formatPasskeyDate } from '@/utils/dateFormatter';

export const getBackupName = (date: Date, locale: Locale) => `Nuble Wallet - ${formatPasskeyDate(date, locale)}`;
