import { getPocketBaseUrl } from './pb'
import { getAuthHeaders } from './auth'

const BASE = getPocketBaseUrl()

function authJsonHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...getAuthHeaders() }
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...authJsonHeaders(), ...(init?.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { message?: string })?.message || `请求失败 (${res.status})`
    const err = new Error(msg) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return data as T
}

export interface WalletMe {
  ok: boolean
  email: string
  name: string
  balance: number
  held: number
  is_admin: boolean
  banned?: boolean
  total_recharged: number
  total_consumed: number
}

export interface RechargeItem {
  id: string
  user_email: string
  amount: number
  pay_method: string
  note: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by: string
  review_note: string
  created: string
}

export interface AdminOverview {
  ok: boolean
  wallets: Array<{
    id: string
    email: string
    balance: number
    held: number
    is_admin: boolean
    banned?: boolean
    total_recharged: number
    total_consumed: number
  }>
  pending: RechargeItem[]
  recent_txns: Array<{
    id: string
    user_email: string
    kind: string
    amount: number
    balance_after: number
    model: string
    note: string
    created: string
  }>
}

export function fetchWallet(): Promise<WalletMe> {
  return jsonFetch<WalletMe>('/api/wallet/me')
}

export function fetchMyRecharges(): Promise<{ ok: boolean; items: RechargeItem[] }> {
  return jsonFetch('/api/recharges/my')
}

export function submitRecharge(input: { amount: number; pay_method?: string; note?: string }): Promise<{ ok: boolean; message?: string }> {
  return jsonFetch('/api/recharges', {
    method: 'POST',
    body: JSON.stringify({ amount: input.amount, pay_method: input.pay_method || 'wechat', note: input.note || '' }),
  })
}

export interface AdminCosts {
  ok: boolean
  total_cost: number
  month_cost: number
  today_cost: number
  last7_cost: number
  admin_cost: number
  user_cost: number
  calls_total: number
  calls_month: number
  success_total: number
  refunded_total: number
  by_model: Array<{ model: string; cost: number; calls: number }>
  by_day: Array<{ day: string; cost: number }>
  top_users: Array<{ email: string; cost: number; calls: number }>
  note: string
}

export function adminOverview(): Promise<AdminOverview> {
  return jsonFetch<AdminOverview>('/api/admin/overview')
}

export function adminCosts(): Promise<AdminCosts> {
  return jsonFetch<AdminCosts>('/api/admin/costs')
}

export type StatsRange = 'today' | 'yesterday' | '7d' | '30d' | '6m' | '1y' | 'all' | 'custom'

export interface AdminStats {
  ok: boolean
  range: StatsRange
  start: string | null
  end: string
  calls_total: number
  status: { success: number; failed: number; running: number }
  net_cost: number
  admin_cost: number
  user_cost: number
  recharge_total: number
  wallet_balance_sum: number
  trend: Array<{ bucket: string; calls: number; cost: number }>
  by_model: Array<{ model: string; calls: number; success: number; failed: number }>
  top_users: Array<{ email: string; calls: number; success: number; failed: number }>
  note: string
}

export function adminStats(input: { range: StatsRange; start?: string; end?: string }): Promise<AdminStats> {
  return jsonFetch('/api/admin/stats', { method: 'POST', body: JSON.stringify(input) })
}

export interface AdminUserStats {
  ok: boolean
  found: boolean
  email: string
  message?: string
  name?: string
  banned?: boolean
  is_admin?: boolean
  created?: string
  wallet?: { balance: number; total_recharged: number; total_consumed: number }
  range: StatsRange
  start: string | null
  end: string
  calls_total: number
  status: { success: number; failed: number; running: number }
  net_cost: number
  admin_cost: number
  recharge_in_range: number
  by_model: Array<{ model: string; calls: number; success: number; failed: number }>
  recent_tasks: Array<{ id: string; model: string; status: string; prompt: string; cost: string; created: string }>
  recent_txns: Array<{ kind: string; amount: number; note: string; model: string; status: string; created: string }>
}

export function adminUserStats(input: { email: string; range: StatsRange; start?: string; end?: string }): Promise<AdminUserStats> {
  return jsonFetch('/api/admin/user-stats', { method: 'POST', body: JSON.stringify(input) })
}

export function adminApprove(id: string, note?: string): Promise<{ ok: boolean }> {
  return jsonFetch(`/api/admin/recharges/${id}/approve`, { method: 'POST', body: JSON.stringify({ note: note || '' }) })
}

export function adminReject(id: string, note?: string): Promise<{ ok: boolean }> {
  return jsonFetch(`/api/admin/recharges/${id}/reject`, { method: 'POST', body: JSON.stringify({ note: note || '' }) })
}

export interface AdminWalletLookup {
  ok: boolean
  found: boolean
  email: string
  message?: string
  name?: string
  balance?: number
  total_recharged?: number
  total_consumed?: number
  is_admin?: boolean
  banned?: boolean
  created?: string
}

export function adminLookupUser(email: string): Promise<AdminWalletLookup> {
  return jsonFetch('/api/admin/wallets/lookup', { method: 'POST', body: JSON.stringify({ email }) })
}

export function adminAdjust(input: { email: string; amount: number; note?: string }): Promise<{ ok: boolean; balance?: number }> {
  return jsonFetch('/api/admin/wallets/adjust', {
    method: 'POST',
    body: JSON.stringify({ email: input.email, amount: input.amount, note: input.note || '' }),
  })
}

export interface NotificationItem {
  id: string
  kind: string
  title: string
  body: string
  amount: number
  balance_after: number
  read: boolean
  created: string
}

export function fetchNotifications(): Promise<{ ok: boolean; items: NotificationItem[]; unread: number }> {
  return jsonFetch('/api/notifications')
}

export function markNotificationRead(id?: string): Promise<{ ok: boolean }> {
  return jsonFetch('/api/notifications/read', { method: 'POST', body: JSON.stringify(id ? { id } : {}) })
}

export function adminSetUserStatus(input: { email: string; banned: boolean }): Promise<{ ok: boolean; status?: string }> {
  return jsonFetch('/api/admin/users/set-status', {
    method: 'POST',
    body: JSON.stringify({ email: input.email, status: input.banned ? 'banned' : 'active' }),
  })
}
