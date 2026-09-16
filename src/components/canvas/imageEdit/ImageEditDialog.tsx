import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { useCanvas } from '@/pages/Canvas/useCanvas'
import { CropMode } from './CropMode'
import { DrawMode } from './DrawMode'
import { GridMode } from './GridMode'
import type { GridPart } from './GridMode'

type CanvasVm = ReturnType<typeof useCanvas>

const MODE_META: Record<string, { title: string; desc: string }> = {
  crop: { title: '裁剪图片', desc: '拖动裁剪框移动, 拖右下角手柄调整大小' },
  extract: { title: '提取选区', desc: '框选一块区域, 裁出含周边上下文的局部图, 用于局部重绘后融合' },
  draw: { title: '画笔标注', desc: '直接在图片上绘制标注或记号' },
  grid: { title: '宫格切分', desc: '按切割线分割图片, 间隔会从线两侧扣除' },
}

/** 图片编辑器深色弹窗: 裁剪 / 画笔标注 / 宫格切分三种模式 */
export function ImageEditDialog({ p }: { p: CanvasVm }) {
  const [busy, setBusy] = useState(false)
  const card = p.editDialogId ? p.cards.find(c => c.id === p.editDialogId) : undefined
  const mode = p.editDialogMode
  const open = !!card && !!card.url && !!mode

  function close() {
    if (busy) return
    p.closeImageEditor()
  }

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  async function handleCropExport(blob: Blob) {
    if (!card) return
    await withBusy(async () => {
      await p.applyImageEdit(card.id, { kind: 'crop', blob })
    })
  }

  async function handleDrawExport(blob: Blob) {
    if (!card) return
    await withBusy(async () => {
      await p.applyImageEdit(card.id, { kind: 'draw', blob })
    })
  }

  async function handleGridExport(parts: GridPart[]) {
    if (!card) return
    await withBusy(async () => {
      await p.applyImageEdit(card.id, { kind: 'grid', parts: parts.map(({ blob, row, col, rows, cols, naturalW, naturalH, name }) => ({ blob, row, col, rows, cols, naturalW, naturalH, name })) })
    })
  }

  async function handleExtractSelection(sel: { x: number; y: number; w: number; h: number; sourceWidth: number; sourceHeight: number }) {
    if (!card) return
    await withBusy(async () => {
      await p.handleExtractSelection(card.id, sel)
    })
  }

  const meta = mode ? MODE_META[mode] : null

  return (
    <Dialog open={open} onOpenChange={v => !v && close()}>
      <DialogContent
        className="flex h-[86vh] max-w-5xl flex-col gap-0 overflow-hidden border-border bg-card p-0 sm:rounded-xl"
        onInteractOutside={e => e.preventDefault()}
      >
        <div className="flex shrink-0 items-start justify-between px-5 pt-4">
          <div>
            <DialogTitle className="text-base font-semibold text-card-foreground">{meta?.title}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-muted-foreground">{meta?.desc}</DialogDescription>
          </div>
        </div>

        {open && card?.url && (
          <div className="mt-3 flex min-h-0 flex-1 flex-col">
            {mode === 'crop' && <CropMode imageUrl={card.url} busy={busy} mode="crop" onExport={handleCropExport} onCancel={close} />}
            {mode === 'extract' && (
              <CropMode imageUrl={card.url} busy={busy} mode="extract" onExport={handleCropExport} onExtract={handleExtractSelection} onCancel={close} />
            )}
            {mode === 'draw' && <DrawMode imageUrl={card.url} busy={busy} onExport={handleDrawExport} onCancel={close} />}
            {mode === 'grid' && <GridMode imageUrl={card.url} busy={busy} onExport={handleGridExport} onCancel={close} />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
