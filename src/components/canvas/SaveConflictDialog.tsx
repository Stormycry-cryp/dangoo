import { useEffect } from 'react'
import { GitMerge, RefreshCw, UploadCloud } from 'lucide-react'
import type { useCanvas } from '@/pages/Canvas/useCanvas'

type CanvasVm = ReturnType<typeof useCanvas>

/**
 * 多标签/多设备保存冲突弹窗: 服务端版本比本地新, 本地若直接保存会覆盖别人(或另一标签)的改动。
 * 不提供「静默覆盖」: 必须在「加载最新(放弃本地未保存改动)」与「强制覆盖(用我的版本)」间显式二选一。
 */
export function SaveConflictDialog({ p }: { p: CanvasVm }) {
  const data = p.saveConflict
  const open = !!data

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!data) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="画布内容冲突"
        className="w-[min(460px,92vw)] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex flex-col items-center gap-3 px-5 pb-4 pt-6 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
            <GitMerge className="h-5 w-5 text-primary" />
          </span>
          <h2 className="text-base font-semibold text-foreground">这个画布在别处被修改过</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            另一个标签页或设备已经保存了更新的内容。为避免互相覆盖，请选择如何处理你当前的改动：
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={() => void p.resolveConflictReload()}
            className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-left transition-colors hover:border-primary hover:bg-secondary"
          >
            <RefreshCw className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">加载最新版本</span>
              <span className="text-xs text-muted-foreground">放弃本页尚未保存的改动，以别处保存的内容为准</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => p.resolveConflictOverwrite()}
            className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-left transition-colors hover:border-destructive hover:bg-destructive/10"
          >
            <UploadCloud className="h-4 w-4 shrink-0 text-destructive" />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">用我的版本强制覆盖</span>
              <span className="text-xs text-muted-foreground">保留本页改动，覆盖别处保存的新内容</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
