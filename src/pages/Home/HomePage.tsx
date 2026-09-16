import { Toaster } from "sonner"
import { WorkbenchTopBar } from "@/components/home/WorkbenchTopBar"
import { WorkbenchHero } from "@/components/home/WorkbenchHero"
import { CanvasGrid } from "@/components/home/CanvasGrid"
import { TrashDialog } from "@/components/home/TrashDialog"
import { RenameDialog } from "@/components/home/RenameDialog"
import { WelcomeDialog } from "@/components/home/WelcomeDialog"
import { AuthDialog } from "@/components/canvas/account/AuthDialog"
import { RechargeDialog } from "@/components/canvas/account/RechargeDialog"
import type { useHome } from "./useHome"

export function HomePage(p: ReturnType<typeof useHome>) {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary/10 via-transparent to-transparent"
      />

      <WorkbenchTopBar
        trashCount={p.trashCanvases.length}
        creating={p.creating}
        onCreate={p.createCanvas}
        onExport={p.exportProject}
        onImportFile={p.importProjectFile}
        onOpenTrash={() => p.setTrashOpen(true)}
        account={p.account}
        walletBalance={p.walletBalance}
        walletAdmin={p.walletAdmin}
        onLogin={() => p.setAuthDialog("login")}
        onRecharge={p.openRecharge}
        onLogout={() => {
          p.setAccount(null)
          void p.refreshWallet()
        }}
        refreshWallet={p.refreshWallet}
      />

      <main className="relative">
        <WorkbenchHero
          activeCount={p.activeCanvases.length}
          trashCount={p.trashCanvases.length}
          creating={p.creating}
          onCreate={p.createCanvas}
        />
        <CanvasGrid
          canvases={p.activeCanvases}
          isLoading={p.isLoading}
          loadError={p.loadError}
          creating={p.creating}
          busyId={p.busyId}
          onCreate={p.createCanvas}
          onOpen={p.openCanvas}
          onRenameStart={p.startRename}
          onDelete={p.moveToTrash}
          onReload={p.reload}
        />
        {!p.isLoading && p.canLoadMore && (
          <div className="mx-auto flex w-full max-w-6xl justify-center px-6 pb-10">
            <button
              type="button"
              disabled={p.loadingMore}
              onClick={() => void p.loadMoreCanvases()}
              className="h-10 rounded-lg border border-border bg-card px-6 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
            >
              {p.loadingMore ? '加载中…' : '加载更多画布'}
            </button>
          </div>
        )}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <p>无限画布 · 创作工作台</p>
          <p>画布与回收站自动保存，刷新也不会丢</p>
        </div>
      </footer>

      <WelcomeDialog />

      <TrashDialog
        open={p.trashOpen}
        items={p.trashCanvases}
        busyId={p.busyId}
        onOpenChange={p.setTrashOpen}
        onRestore={p.restoreCanvas}
        onPurge={p.purgeCanvas}
      />

      <RenameDialog
        open={p.renameTarget !== null}
        value={p.renameValue}
        renaming={p.renaming}
        onChange={p.setRenameValue}
        onSubmit={p.submitRename}
        onCancel={p.cancelRename}
      />

      <AuthDialog
        open={p.authDialog === "login"}
        onOpenChange={(v) => p.setAuthDialog(v ? "login" : null)}
        onSuccess={p.handleAuthSuccess}
      />
      <RechargeDialog
        open={p.authDialog === "recharge"}
        onOpenChange={(v) => p.setAuthDialog(v ? "recharge" : null)}
        balance={p.walletBalance}
        onRecharged={() => void p.refreshWallet()}
      />
      <Toaster position="top-center" theme="dark" />
    </div>
  )
}
