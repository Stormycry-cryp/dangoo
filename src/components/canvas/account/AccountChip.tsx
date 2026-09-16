import { useEffect, useRef, useState } from 'react'
import { LogIn, Wallet, ShieldCheck, LogOut, ChevronDown } from 'lucide-react'
import { logoutLocalAccount, type LocalAccount } from '@/lib/localAuth'
import { getBasename } from '@/lib/pb'

interface AccountChipProps {
  account: LocalAccount | null
  balance: number | null
  isAdmin: boolean
  onLogin: () => void
  onRecharge: () => void
  onLogout: () => void
}

export function AccountChip({ account, balance, isAdmin, onLogin, onRecharge, onLogout }: AccountChipProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  if (!account) {
    return (
      <button
        type="button"
        onClick={onLogin}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
      >
        <LogIn className="h-4 w-4 text-primary" />
        未登录
      </button>
    )
  }

  const label = account.name || account.email
  const balText = typeof balance === 'number' ? `¥${balance.toFixed(2)}` : '—'

  return (
    <div className="relative flex items-center gap-1.5" ref={menuRef}>
      <button
        type="button"
        onClick={onRecharge}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Wallet className="h-4 w-4" />
        {balText}
        <span className="opacity-80">· 充值</span>
      </button>

      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1.5 text-sm text-foreground transition-colors hover:border-primary"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-medium">
          {(label || '?').slice(0, 1).toUpperCase()}
        </span>
        <span className="max-w-[100px] truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-xs text-muted-foreground">{account.email}</p>
            <p className="mt-0.5 text-sm font-medium">余额 {balText}</p>
          </div>
          <button
            type="button"
            onClick={() => { setOpen(false); onRecharge() }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
          >
            <Wallet className="h-4 w-4 text-primary" /> 充值额度
          </button>
          {isAdmin && (
            <a
              href={`${getBasename() === '/' ? '' : getBasename()}/admin`}
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <ShieldCheck className="h-4 w-4 text-primary" /> 经营后台
            </a>
          )}
          <button
            type="button"
            onClick={() => { setOpen(false); logoutLocalAccount(); onLogout() }}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-destructive hover:bg-muted"
          >
            <LogOut className="h-4 w-4" /> 退出登录
          </button>
        </div>
      )}
    </div>
  )
}
