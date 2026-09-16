import { useRef } from "react"
import { Download, Loader2, Plus, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import brandLogo from "@/assets/dangoo-logo.jpg"
import { AccountChip } from "@/components/canvas/account/AccountChip"
import { NotificationBell } from "@/components/canvas/account/NotificationBell"
import type { LocalAccount } from "@/lib/localAuth"

interface WorkbenchTopBarProps {
  trashCount: number
  creating: boolean
  onCreate: () => void
  onExport: () => void
  onImportFile: (file: File) => void
  onOpenTrash: () => void
  account: LocalAccount | null
  walletBalance: number | null
  walletAdmin: boolean
  onLogin: () => void
  onRecharge: () => void
  onLogout: () => void
  refreshWallet: () => void
}

export function WorkbenchTopBar(p: WorkbenchTopBarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <img
            src={brandLogo}
            alt="Dangoo！无限创意"
            className="size-9 shrink-0 rounded-lg object-cover shadow-md"
          />
          <div className="leading-tight">
            <p className="font-semibold text-foreground">Dangoo！</p>
            <p className="hidden text-xs text-muted-foreground sm:block">
              无限创意
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <AccountChip
            account={p.account}
            balance={p.walletBalance}
            isAdmin={p.walletAdmin}
            onLogin={p.onLogin}
            onRecharge={p.onRecharge}
            onLogout={p.onLogout}
          />
          <NotificationBell onBalanceChanged={() => void p.refreshWallet()} />
          <div className="mx-1 hidden h-6 w-px bg-border md:block" />
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) p.onImportFile(file)
              e.target.value = ""
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4" />
            <span className="hidden md:inline">导入项目</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={p.onExport}>
            <Download className="size-4" />
            <span className="hidden md:inline">导出项目</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={p.onOpenTrash}>
            <Trash2 className="size-4" />
            <span className="hidden md:inline">回收站</span>
            {p.trashCount > 0 && (
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {p.trashCount}
              </span>
            )}
          </Button>
          <div className="mx-1 hidden h-6 w-px bg-border md:block" />
          <Button
            onClick={p.onCreate}
            disabled={p.creating}
            className="bg-primary text-primary-foreground shadow-md hover:shadow-lg"
          >
            {p.creating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            <span className="hidden sm:inline">新建智能画布</span>
            <span className="sm:hidden">新建</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
