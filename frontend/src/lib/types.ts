// Tipos das respostas da API (ver /docs no backend)

export type Role = "owner" | "member";
export type AccountType = "checking" | "savings" | "investment" | "cash";
export type TransactionType = "income" | "expense" | "transfer";
export type CategoryType = "income" | "expense";

export interface User {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
}

export interface AuthResponse {
  user: User;
  session: Session | null;
}

export interface Household {
  id: string;
  name: string;
  role: Role;
  created_at: string;
  updated_at: string;
}

export interface Me {
  id: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
  households: Household[];
}

export interface Account {
  id: string;
  household_id: string;
  name: string;
  type: AccountType;
  is_active: boolean;
  initial_balance: number;
  current_balance: number;
}

export interface Category {
  id: string;
  household_id: string;
  name: string;
  type: CategoryType;
  color: string | null;
  icon: string | null;
  is_active: boolean;
}

export interface Transaction {
  id: string;
  household_id: string;
  type: TransactionType;
  description: string;
  amount: number;
  account_id: string;
  destination_account_id: string | null;
  category_id: string | null;
  due_date: string;
  payment_date: string | null;
  user_id: string | null;
}

export interface TransactionList {
  data: Transaction[];
  pagination: { total: number; limit: number; offset: number };
}

export interface PaidPendingTotal {
  paid: number;
  pending: number;
  total: number;
}

export interface ReportSummary {
  month: string;
  income: PaidPendingTotal;
  expense: PaidPendingTotal;
  balance: { paid: number; total: number };
}

export interface ReportByCategory {
  month: string;
  type: CategoryType;
  total: number;
  categories: Array<{
    category_id: string;
    name: string;
    color: string | null;
    icon: string | null;
    total: number;
    paid: number;
    pending: number;
    transaction_count: number;
  }>;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Array<{ in?: string; path: string; message: string }> | Record<string, unknown>;
  };
}

export interface Member {
  user_id: string;
  name: string | null;
  role: Role;
  joined_at: string;
}

// Convite visto pelo household (GET /households/:id/invitations)
export interface Invitation {
  id: string;
  household_id: string;
  email: string;
  role: Role;
  status: "pending" | "accepted" | "declined" | "canceled";
  created_at: string;
  expires_at: string;
  invited_by: { user_id: string; name: string | null } | null;
}

// Convite recebido pelo usuário logado (GET /invitations)
export interface MyInvitation {
  id: string;
  household_id: string;
  household_name: string;
  role: Role;
  invited_by_name: string | null;
  created_at: string;
  expires_at: string;
}

export interface ReportMonthly {
  from: string;
  to: string;
  months: ReportSummary[];
}
