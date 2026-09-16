import { useState } from 'react'
import { Loader2, LogIn, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { loginLocalAccount, registerLocalAccount } from '@/lib/localAuth'

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function zhAuthError(err: unknown): string {
  // PocketBase SDK 错误结构: { status, response: { code, message, data } }
  const e = err as {
    message?: string
    status?: number
    response?: { message?: string; data?: Record<string, { message?: string }> }
  }
  const raw = String(e?.response?.message || e?.message || err || '')
  const low = raw.toLowerCase()
  const fieldMsgs = Object.values(e?.response?.data || {})
    .map(f => f?.message)
    .filter(Boolean)
    .join('；')

  if (raw.includes('已注册') || raw.includes('已存在') || (low.includes('email') && (low.includes('exist') || low.includes('unique') || low.includes('registered')))) {
    return '该邮箱已注册, 试试直接登录'
  }
  if (low.includes('password') && (low.includes('length') || low.includes('at least') || low.includes('8'))) {
    return '密码至少 8 位'
  }
  if (low.includes('invalid') || low.includes('credentials') || raw.includes('密码不正确') || raw.includes('邮箱或密码') || low.includes('failed to authenticate')) {
    return '邮箱或密码不正确'
  }
  if (low.includes('email') && low.includes('valid')) return '请输入正确的邮箱'
  if (low.includes('validation') || low.includes('required')) return fieldMsgs || '请填写完整信息'
  // 网络层 / 网关层错误, 与"账号密码错误"区分开, 避免误导
  if (e?.status === 0 || low.includes('failed to fetch') || low.includes('network') || low.includes('load failed')) {
    return '网络连接失败, 请检查网络后重试'
  }
  if (e?.status === 429 || low.includes('too many') || low.includes('rate')) {
    return '操作过于频繁, 请稍后再试'
  }
  if (e?.status && e.status >= 500) return '服务器暂时开小差, 请稍后重试'
  // 其余错误带上服务端原始信息, 方便定位真实原因
  return fieldMsgs || raw ? `操作失败: ${fieldMsgs || raw}` : '操作失败, 请稍后重试'
}

export function AuthDialog({ open, onOpenChange, onSuccess }: AuthDialogProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  function reset() {
    setEmail(''); setPassword(''); setConfirm(''); setDisplayName(''); setErr('')
  }

  async function handleLogin() {
    if (!email.trim() || !password) { setErr('请输入邮箱和密码'); return }
    setBusy(true); setErr('')
    try {
      await loginLocalAccount(email.trim(), password)
      reset(); onSuccess(); onOpenChange(false)
    } catch (e) {
      setErr(zhAuthError(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleRegister() {
    if (!email.trim() || !password) { setErr('请填写邮箱和密码'); return }
    if (password.length < 8) { setErr('密码至少 8 位'); return }
    if (password !== confirm) { setErr('两次输入的密码不一致'); return }
    setBusy(true); setErr('')
    try {
      await registerLocalAccount(email.trim(), password, displayName.trim() || undefined)
      reset(); onSuccess(); onOpenChange(false)
    } catch (e) {
      setErr(zhAuthError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    // 登录/注册窗只允许右上角叉号关闭: 禁止点遮罩空白处、按 ESC 误关,
    // 避免填到一半的邮箱/密码被清空。
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent
        className="sm:max-w-[400px]"
        onPointerDownOutside={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">登录后即可生成图片 / 视频</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            画布内容可随便浏览, 生成作品需要一个账号并充值额度。
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={v => { setTab(v as 'login' | 'register'); setErr('') }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">登录</TabsTrigger>
            <TabsTrigger value="register">注册</TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="mt-4 space-y-3">
            <Input type="email" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
            <Input type="password" placeholder="密码" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()} autoComplete="current-password" />
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleLogin} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
              登录
            </Button>
          </TabsContent>

          <TabsContent value="register" className="mt-4 space-y-3">
            <Input type="email" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
            <Input type="text" placeholder="昵称(可选)" value={displayName} onChange={e => setDisplayName(e.target.value)} />
            <Input type="password" placeholder="密码(至少 8 位)" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
            <Input type="password" placeholder="确认密码" value={confirm} onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRegister()} autoComplete="new-password" />
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleRegister} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              注册并登录
            </Button>
          </TabsContent>
        </Tabs>
        <p className="text-center text-xs text-muted-foreground">账号用于保存你的画布、素材与余额</p>
      </DialogContent>
    </Dialog>
  )
}
