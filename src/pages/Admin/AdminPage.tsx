import {
  Activity, ArrowLeft, Ban, BarChart3, CalendarDays, Check, CheckCircle2, ChevronRight, Coins,
  Loader2, Plus, Minus, RotateCcw, Search, TrendingUp, User, Users, Wallet, X, XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAdmin, type AdminVm } from './useAdmin'
import type { StatsRange } from '@/lib/wallet'

const RANGE_TABS: Array<{ key: StatsRange; label: string }> = [
  { key: 'today', label: '今日' },
  { key: 'yesterday', label: '昨日' },
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
  { key: '6m', label: '近 6 个月' },
  { key: '1y', label: '近 1 年' },
  { key: 'all', label: '全部' },
]

const QUICK: Array<{ key: '3d' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth'; label: string }> = [
  { key: '3d', label: '近 3 天' },
  { key: 'thisWeek', label: '本周' },
  { key: 'lastWeek', label: '上周' },
  { key: 'thisMonth', label: '本月' },
  { key: 'lastMonth', label: '上月' },
]

const TXN_ZH: Record<string, string> = {
  gen: '生成扣费', gen_admin: '管理员测试', refund: '退款', refund_admin: '失败冲销',
  void: '未受理退回', void_admin: '未受理冲销', recharge: '充值到账', admin_add: '管理员加额', admin_sub: '管理员减额',
}
const TASK_STATUS_ZH: Record<string, string> = { success: '成功', failed: '失败', running: '进行中', queued: '排队中' }

const SECTIONS: Array<{ key: 'dashboard' | 'recharges' | 'users' | 'txns'; label: string; icon: React.ReactNode }> = [
  { key: 'dashboard', label: '经营概览', icon: <BarChart3 className="h-4 w-4" /> },
  { key: 'recharges', label: '充值审核', icon: <Wallet className="h-4 w-4" /> },
  { key: 'users', label: '用户额度', icon: <Users className="h-4 w-4" /> },
  { key: 'txns', label: '账务流水', icon: <Activity className="h-4 w-4" /> },
]

export function AdminPage() {
  const p = useAdmin()

  if (!p.authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }
  if (!p.isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <XCircle className="h-7 w-7 text-destructive" />
        </div>
        <p className="text-lg font-semibold text-foreground">{p.wallet ? '仅管理员可访问经营看板' : '请先登录管理员账号'}</p>
        <p className="max-w-sm text-sm text-muted-foreground">这里是创作者的经营后台，请使用管理员账号登录后再进入。</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={p.goHome}><ArrowLeft className="mr-1 h-4 w-4" />返回画布</Button>
          {!p.wallet && <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={p.login}>去登录</Button>}
        </div>
      </div>
    )
  }

  return <AdminShell p={p} />
}

function AdminShell({ p }: { p: AdminVm }) {
  const pendingCount = p.overview?.pending?.length ?? 0
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={p.goHome}><ArrowLeft className="mr-1 h-4 w-4" />返回</Button>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <Activity className="h-5 w-5 text-primary" /> 经营后台
          </h1>
          <span className="ml-auto hidden text-xs text-muted-foreground sm:block">{p.wallet?.email}</span>
        </div>
        {/* 分区导航 */}
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-5 pb-2">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => { p.closeUser(); p.setTab(s.key) }}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                p.tab === s.key && !p.drillEmail ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {s.icon}{s.label}
              {s.key === 'recharges' && pendingCount > 0 && (
                <span className={`ml-0.5 rounded-full px-1.5 text-[10px] ${p.tab === 'recharges' ? 'bg-primary-foreground/25 text-primary-foreground' : 'bg-primary text-primary-foreground'}`}>{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-5">
        {p.drillEmail ? <UserDrill p={p} />
          : p.tab === 'dashboard' ? <DashboardSection p={p} />
          : p.tab === 'recharges' ? <RechargesSection p={p} />
          : p.tab === 'users' ? <UsersSection p={p} />
          : <TxnsSection p={p} />}
      </main>
    </div>
  )
}

/* ---------------- 经营概览 ---------------- */

function DashboardSection({ p }: { p: AdminVm }) {
  const s = p.stats
  return (
    <div className="space-y-4">
      {/* 时间筛选 */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <CalendarDays className="h-4 w-4 text-primary" /> 时间范围
          </span>
          {RANGE_TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => p.setRange(t.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                p.range === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => p.setRange('custom')}
            className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
              p.range === 'custom' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            指定日期
          </button>
        </div>

        {p.range === 'custom' && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input type="date" value={p.start} onChange={e => p.setStart(e.target.value)} className="h-9 w-44" />
            <span className="text-sm text-muted-foreground">至</span>
            <Input type="date" value={p.end} onChange={e => p.setEnd(e.target.value)} className="h-9 w-44" />
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!p.start || !p.end || p.loading} onClick={p.applyCustom}>
              应用
            </Button>
            <span className="text-xs text-muted-foreground">只选一天：起止选同一天</span>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">快捷区间</span>
          {QUICK.map(q => (
            <button
              key={q.key}
              type="button"
              onClick={() => p.applyQuick(q.key)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
            >
              {q.label}
            </button>
          ))}
          <span className="text-xs text-muted-foreground">{s ? `统计区间：${s.start ?? '最早'} 至 ${s.end}` : ''}</span>
        </div>
      </section>

      {p.error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{p.error}</p>}

      {/* 核心数字卡 */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="primary" icon={<TrendingUp className="h-5 w-5" />} label="总调用次数" value={p.loading ? '…' : String(s?.calls_total ?? 0)} sub={`统计口径 · ${p.rangeText}`} />
        <StatCard icon={<Coins className="h-5 w-5" />} label="总消耗（真实成本净额）" value={p.loading ? '…' : `¥${Number(s?.net_cost ?? 0).toFixed(2)}`}
          sub={`你测试 ¥${Number(s?.admin_cost ?? 0).toFixed(2)} · 用户 ¥${Number(s?.user_cost ?? 0).toFixed(2)}`} />
        <StatCard icon={<Activity className="h-5 w-5" />} label="区间内调用" value={p.loading ? '…' : String(s?.calls_total ?? 0)} sub="区间内的生成任务次数" />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="任务状态" value={p.loading ? '…' : String(s?.status.success ?? 0)} valueSuffix="成功"
          sub={
            <span className="flex flex-wrap gap-x-2">
              <span className="text-primary">成功 {s?.status.success ?? 0}</span>
              <span className="text-destructive">失败 {s?.status.failed ?? 0}</span>
              <span className="text-muted-foreground">进行中 {s?.status.running ?? 0}</span>
            </span>
          } />
      </section>

      {/* 资金概览 */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <Wallet className="h-8 w-8 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">站内钱包余额合计（当前所有用户）</p>
            <p className="text-xl font-semibold">{p.loading ? '…' : `¥${Number(s?.wallet_balance_sum ?? 0).toFixed(2)}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <Users className="h-8 w-8 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">区间内客户充值到账</p>
            <p className="text-xl font-semibold">{p.loading ? '…' : `¥${Number(s?.recharge_total ?? 0).toFixed(2)}`}</p>
          </div>
        </div>
      </section>

      {/* 趋势图 */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">调用趋势{p.range === '6m' || p.range === '1y' ? '（按月）' : '（按天）'}</h2>
          {p.loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>
        {!p.loading && (s?.trend ?? []).reduce((sum, t) => sum + t.calls, 0) === 0 ? (
          <div className="flex h-44 items-center justify-center"><p className="text-sm text-muted-foreground">该区间暂无调用</p></div>
        ) : (
          <div className="flex h-44 items-end gap-1 overflow-x-auto">
            {(s?.trend ?? []).map((t, i) => {
              const hasCalls = t.calls > 0
              const heightPx = hasCalls ? Math.max(8, Math.round((t.calls / p.trendMax) * 132)) : 2
              const many = (s?.trend.length ?? 0) > 31
              return (
                <div key={i} className={`flex ${many ? 'min-w-[14px]' : 'min-w-[20px] max-w-[64px]'} flex-1 flex-col items-center justify-end gap-1`} title={`${t.bucket} · ${t.calls} 次 · ¥${Number(t.cost).toFixed(2)}`}>
                  {hasCalls && <span className="text-[10px] font-medium leading-none text-foreground">{t.calls}</span>}
                  <div className={`w-full rounded-t transition-all ${hasCalls ? 'bg-primary/70 hover:bg-primary' : 'bg-muted'}`} style={{ height: `${heightPx}px` }} />
                  <span className="hidden text-[9px] text-muted-foreground sm:block">{String(t.bucket).slice(-5)}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* 模型 / 用户（用户可下钻）*/}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">按模型</h2>
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {(s?.by_model ?? []).map(m => (
              <div key={m.model} className="flex items-center justify-between rounded bg-muted/40 px-3 py-1.5 text-xs">
                <span className="truncate">{m.model}</span>
                <span className="flex shrink-0 gap-2 text-muted-foreground">
                  <span className="text-primary">{m.success} 成</span>
                  <span className="text-destructive">{m.failed} 败</span>
                  <span className="font-medium text-foreground">{m.calls} 次</span>
                </span>
              </div>
            ))}
            {(!s || s.by_model.length === 0) && <p className="py-6 text-center text-xs text-muted-foreground">暂无数据</p>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">调用最多用户</h2>
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {(s?.top_users ?? []).map(u => (
              <button
                key={u.email}
                type="button"
                onClick={() => p.openUser(u.email)}
                className="flex w-full items-center justify-between rounded bg-muted/40 px-3 py-1.5 text-xs transition-colors hover:bg-primary/10"
                title="查看该用户明细"
              >
                <span className="flex min-w-0 items-center gap-1">
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{u.email}</span>
                </span>
                <span className="flex shrink-0 gap-2 text-muted-foreground">
                  <span className="text-primary">{u.success} 成</span>
                  <span className="text-destructive">{u.failed} 败</span>
                  <span className="font-medium text-foreground">{u.calls} 次</span>
                </span>
              </button>
            ))}
            {(!s || s.top_users.length === 0) && <p className="py-6 text-center text-xs text-muted-foreground">暂无数据</p>}
          </div>
        </div>
      </section>

      <p className="pb-2 text-[11px] leading-relaxed text-muted-foreground">{s?.note} 平台未开放密钥查余额，RunningHub 账户剩余金额请到控制台查看。</p>
    </div>
  )
}

/* ---------------- 充值审核 ---------------- */

function RechargesSection({ p }: { p: AdminVm }) {
  const pending = p.overview?.pending ?? []
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">待审核充值</h2>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{pending.length} 笔</span>
        {p.overviewLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
      </div>
      {pending.length === 0 && !p.overviewLoading && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">暂无待审核的充值申请</div>
      )}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {pending.map(it => (
          <div key={it.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{it.user_email}</p>
              <p className="text-xs text-muted-foreground">
                ¥{Number(it.amount).toFixed(2)} · {new Date(it.created).toLocaleString('zh-CN')}{it.note ? ` · ${it.note}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={p.busy === it.id} onClick={() => p.approveRecharge(it.id)}>
                {p.busy === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}到账
              </Button>
              <Button size="sm" variant="outline" disabled={p.busy === it.id} onClick={() => p.rejectRecharge(it.id)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- 用户额度 ---------------- */

function UsersSection({ p }: { p: AdminVm }) {
  const lk = p.lookup
  return (
    <div className="space-y-4">
      {/* 查询 */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex gap-2">
          <Input placeholder="输入用户邮箱后点查询" value={p.queryEmail} onChange={e => p.setQueryEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void p.lookupUser(p.queryEmail) }} />
          <Button size="sm" className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90" disabled={p.busy === 'lookup'} onClick={() => void p.lookupUser(p.queryEmail)}>
            {p.busy === 'lookup' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />}查询
          </Button>
        </div>

        {lk && !lk.found && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <XCircle className="h-5 w-5 shrink-0" />{lk.message || '该邮箱还没有注册账号'}
          </div>
        )}

        {lk?.found && (
          <div className="mt-3 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-sm">
                <span className="truncate font-medium">{lk.email}</span>
                {lk.is_admin && <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">管理员</span>}
                {lk.banned && <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">已停用</span>}
              </span>
              <span className="shrink-0 text-lg font-semibold text-primary">¥{Number(lk.balance ?? 0).toFixed(2)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="rounded bg-card px-2 py-1">累计充值 ¥{Number(lk.total_recharged ?? 0).toFixed(2)}</div>
              <div className="rounded bg-card px-2 py-1">累计消费 ¥{Number(lk.total_consumed ?? 0).toFixed(2)}</div>
            </div>
            <div className="space-y-2 border-t border-border pt-2">
              <p className="text-xs font-medium text-muted-foreground">调整该用户额度</p>
              <div className="flex gap-2">
                <Input type="number" min={0} step="0.01" placeholder="金额(元)" value={p.adjAmount} onChange={e => p.setAdjAmount(e.target.value)} />
                <Button size="sm" variant="outline" className="shrink-0" disabled={p.busy === 'adjust'} onClick={() => void p.adjustUser(1)} title="增加额度">
                  {p.busy === 'adjust' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 text-primary" />}
                </Button>
                <Button size="sm" variant="outline" className="shrink-0" disabled={p.busy === 'adjust'} onClick={() => void p.adjustUser(-1)} title="扣减额度">
                  {p.busy === 'adjust' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Minus className="h-4 w-4 text-destructive" />}
                </Button>
              </div>
              <Input placeholder="备注(可选)" value={p.adjNote} onChange={e => p.setAdjNote(e.target.value)} />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2">
              <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-primary" onClick={() => p.openUser(lk.email)}>
                查看该用户明细 <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              {!lk.is_admin && (
                lk.banned ? (
                  <Button size="sm" variant="outline" className="h-8 text-xs" disabled={p.busy === `ban:${lk.email}`} onClick={() => void p.toggleBan(lk.email, false)}>
                    {p.busy === `ban:${lk.email}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}启用账号
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-8 text-xs text-destructive hover:bg-destructive/10" disabled={p.busy === `ban:${lk.email}`} onClick={() => void p.toggleBan(lk.email, true)}>
                    {p.busy === `ban:${lk.email}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}停用账号
                  </Button>
                )
              )}
            </div>
          </div>
        )}
      </section>

      {/* 全部账户 */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">全部账户 ({p.overview?.wallets?.length ?? 0})</h2>
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {(!p.overview || p.overview.wallets.length === 0) && !p.overviewLoading && <p className="py-6 text-center text-xs text-muted-foreground">暂无账户</p>}
          {p.overviewLoading && <div className="py-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /></div>}
          {p.overview?.wallets?.map(w => (
            <button
              key={w.id}
              type="button"
              onClick={() => { p.setQueryEmail(w.email); void p.lookupUser(w.email) }}
              className={`flex w-full items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-left text-sm hover:bg-primary/10 ${w.banned ? 'opacity-70' : ''}`}
              title="点击查询该账户"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{w.email}</span>
                {w.is_admin && <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">管理员</span>}
                {w.banned && <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">已停用</span>}
              </span>
              <span className="shrink-0 font-medium">¥{Number(w.balance).toFixed(2)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

/* ---------------- 账务流水 ---------------- */

function TxnsSection({ p }: { p: AdminVm }) {
  const txns = p.overview?.recent_txns ?? []
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">最近账务流水</h2>
      {p.overviewLoading ? (
        <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /></div>
      ) : txns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">暂无流水</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {txns.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5 text-xs last:border-0">
              <div className="min-w-0">
                <p className="truncate text-sm">{TXN_ZH[t.kind] || t.kind}{t.model ? ` · ${t.model}` : ''}</p>
                <p className="truncate text-muted-foreground">{t.user_email}{t.note ? ` · ${t.note}` : ''} · {new Date(t.created).toLocaleString('zh-CN')}</p>
              </div>
              <span className={`shrink-0 text-sm font-medium ${Number(t.amount) < 0 ? 'text-destructive' : 'text-primary'}`}>
                {Number(t.amount) > 0 ? '+' : ''}¥{Number(t.amount).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- 用户明细下钻 ---------------- */

function UserDrill({ p }: { p: AdminVm }) {
  const u = p.userStats
  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={p.closeUser}><ArrowLeft className="mr-1 h-4 w-4" />返回看板</Button>

      {p.userLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !u || !u.found ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">{u?.message || '未找到该用户'}</p>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-2 text-base font-semibold"><User className="h-5 w-5 text-primary" />{u.email}</span>
              {u.is_admin && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">管理员</span>}
              {u.banned && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">已停用</span>}
              <span className="ml-auto text-xs text-muted-foreground">
                区间 {u.start ?? '最早'} 至 {u.end}{u.created ? ` · 注册于 ${u.created.slice(0, 10)}` : ''}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Mini label="当前站内余额" value={`¥${Number(u.wallet?.balance ?? 0).toFixed(2)}`} />
              <Mini label="区间真实消耗(净额)" value={`¥${Number(u.net_cost).toFixed(2)}`} highlight />
              <Mini label="累计充值" value={`¥${Number(u.wallet?.total_recharged ?? 0).toFixed(2)}`} />
              <Mini label="累计消费(站内)" value={`¥${Number(u.wallet?.total_consumed ?? 0).toFixed(2)}`} />
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard tone="primary" icon={<TrendingUp className="h-5 w-5" />} label="区间调用次数" value={String(u.calls_total)} sub={`统计口径 · ${p.rangeText}`} />
            <StatCard icon={<Coins className="h-5 w-5" />} label="区间充值到账" value={`¥${Number(u.recharge_in_range).toFixed(2)}`} sub="审核通过的充值合计" />
            <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="成功任务" value={String(u.status.success)} sub={`失败 ${u.status.failed} · 进行中 ${u.status.running}`} />
            <StatCard icon={<Activity className="h-5 w-5" />} label="成功率" value={`${u.calls_total ? Math.round((u.status.success / u.calls_total) * 100) : 0}%`} sub={`${u.status.success}/${u.calls_total}`} />
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">使用的模型</h2>
            <div className="max-h-56 space-y-1.5 overflow-y-auto">
              {u.by_model.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">该区间暂无调用</p>}
              {u.by_model.map(m => (
                <div key={m.model} className="flex items-center justify-between rounded bg-muted/40 px-3 py-1.5 text-xs">
                  <span className="truncate">{m.model}</span>
                  <span className="flex shrink-0 gap-2 text-muted-foreground">
                    <span className="text-primary">{m.success} 成</span>
                    <span className="text-destructive">{m.failed} 败</span>
                    <span className="font-medium text-foreground">{m.calls} 次</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold">最近任务</h2>
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {u.recent_tasks.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">暂无任务</p>}
                {u.recent_tasks.map((t, i) => (
                  <div key={i} className="rounded bg-muted/40 px-3 py-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{t.model}</span>
                      <span className={`shrink-0 ${t.status === 'success' ? 'text-primary' : t.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {TASK_STATUS_ZH[t.status] || t.status}{t.cost ? ` · ¥${t.cost}` : ''}
                      </span>
                    </div>
                    {t.prompt && <p className="mt-0.5 truncate text-muted-foreground">{t.prompt}</p>}
                    <p className="mt-0.5 text-[10px] text-muted-foreground/80">{t.created.slice(0, 16).replace('T', ' ')}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold">最近账务流水</h2>
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {u.recent_txns.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">暂无流水</p>}
                {u.recent_txns.map((t, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded bg-muted/40 px-3 py-1.5 text-xs">
                    <span className="flex min-w-0 items-center gap-1">
                      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{TXN_ZH[t.kind] || t.kind}{t.note ? ` · ${t.note}` : ''}</span>
                    </span>
                    <span className={`shrink-0 font-medium ${Number(t.amount) < 0 ? 'text-destructive' : 'text-primary'}`}>
                      {Number(t.amount) > 0 ? '+' : ''}¥{Number(t.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function Mini({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </div>
  )
}

function StatCard({ icon, label, value, sub, valueSuffix, tone }: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: React.ReactNode
  valueSuffix?: string
  tone?: 'primary'
}) {
  return (
    <div className={`rounded-xl border p-4 ${tone === 'primary' ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'}`}>
      <div className={`flex items-center gap-1.5 text-xs ${tone === 'primary' ? 'text-primary' : 'text-muted-foreground'}`}>{icon}{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`text-3xl font-semibold ${tone === 'primary' ? 'text-primary' : 'text-foreground'}`}>{value}</span>
        {valueSuffix && <span className="text-sm text-muted-foreground">{valueSuffix}</span>}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}
