import { Loader2 } from 'lucide-react'
import { CostConfirmDialog } from '@/components/rh/CostConfirmDialog'
import { CanvasTopBar } from '@/components/canvas/CanvasTopBar'
import { CanvasStage } from '@/components/canvas/CanvasStage'
import { AssetLibraryPanel } from '@/components/canvas/asset-library/AssetLibraryPanel'
import { AssetPickerDialog } from '@/components/canvas/AssetPickerDialog'
import { GenerationLogDialog } from '@/components/canvas/generation-log/GenerationLogDialog'
import { BatchImageConfirmDialog } from '@/components/canvas/BatchImageConfirmDialog'
import { CameraConfigDialog } from '@/components/canvas/CameraConfigDialog'
import { FrameCaptureDialog } from '@/components/canvas/FrameCaptureDialog'
import { TagManagerDialog } from '@/components/canvas/tags/TagManagerDialog'
import { SaveConflictDialog } from '@/components/canvas/SaveConflictDialog'
import { LocalRestoreDialog } from '@/components/canvas/LocalRestoreDialog'
import { ImagePreviewDialog } from '@/components/canvas/ImagePreviewDialog'
import { ImageEditDialog } from '@/components/canvas/imageEdit/ImageEditDialog'
import { AuthDialog } from '@/components/canvas/account/AuthDialog'
import { RechargeDialog } from '@/components/canvas/account/RechargeDialog'
import { CanvasRuntimeProvider } from '@/components/canvas/canvasRuntime'
import type { useCanvas } from './useCanvas'

export function CanvasPage(p: ReturnType<typeof useCanvas>) {
  if (!p.docLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex animate-in fade-in flex-col items-center gap-3 duration-500">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">画布加载中…</p>
        </div>
      </div>
    )
  }

  return (
    <CanvasRuntimeProvider vm={p}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <CanvasTopBar p={p} />

        <div className="relative min-h-0 flex-1">
          <CanvasStage p={p} />
          <AssetLibraryPanel p={p} />
        </div>

      <AssetPickerDialog p={p} />
      <CameraConfigDialog p={p} />
      <FrameCaptureDialog p={p} />
      <TagManagerDialog />
      <GenerationLogDialog p={p} />
      <BatchImageConfirmDialog p={p} />
      <SaveConflictDialog p={p} />
      <LocalRestoreDialog p={p} />
      <ImagePreviewDialog p={p} />
      <ImageEditDialog p={p} />
      <CostConfirmDialog {...p} />

      <AuthDialog
        open={p.authDialog === 'login'}
        onOpenChange={v => p.setAuthDialog(v ? 'login' : null)}
        onSuccess={p.handleAuthSuccess}
      />
        <RechargeDialog
          open={p.authDialog === 'recharge'}
          onOpenChange={v => p.setAuthDialog(v ? 'recharge' : null)}
          balance={p.walletBalance}
          onRecharged={() => void p.refreshWallet()}
        />
      </div>
    </CanvasRuntimeProvider>
  )
}
