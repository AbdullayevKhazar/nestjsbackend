export interface BackupFile {
  timestamp: string;
  version: number;

  debtors: BackupCustomer[];

  transactions: BackupTransaction[];
}

export interface BackupCustomer {
  id: number;

  name: string;

  phone: string;

  location?: string;

  note?: string;

  created_at: number;
}

export interface BackupTransaction {
  id: number;

  debtor_id: number;

  type: 'debt' | 'payment';

  amount: number;

  note?: string;

  date: number;

  created_at: number;
}
