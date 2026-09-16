import { memo, useEffect, useRef, useState } from 'react'
import { Check, Film, Layers, Pencil, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { useCanvas } from '@/pages/Canvas/useCanvas'
import { ASSET_DND_ENTRY, writeAssetDnd, type AssetLibEntry } from './assetLib'
import { LazyThumb } from './LazyThumb'
import { LazyVideo } from './LazyVideo'
import { AssetDropPreview } from './AssetDropPreview'

type CanvasVm = ReturnType<typeof useCanvas>
const HOVER_PREVIEW_DELAY = 500

/** 单个资产缩略图卡: 懒加载 / 视频角标 / 图片组角标 / 悬停大图预览 / 重命名 / 删除(二次确认) / 拖出到画布。
 *  memo: 网格/面板在打字等无关重渲染时, entry 未变的卡直接跳过(旧实现每张卡都重新 reconcile) */
export const AssetGridCard = memo(function AssetGridCard({
  p,
  entry,
  scrollRoot,
}: {
  p: CanvasVm
  entry: AssetLibEntry
  scrollRoot?: HTMLElement | null
}) {
  const [hovered, setHovered] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(entry.displayName)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 卡片卸载(快速滚动/切文件夹/关面板)时清掉待触发的悬停预览, 避免在复用的新卡上错位弹旧预览
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }, [])

  function enter() {
    setHovered(true)
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setShowPreview(true), HOVER_PREVIEW_DELAY)
  }
  function leave() {
    setHovered(false)
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setShowPreview(false)
  }

  async function submitRename() {
    const name = draftName.trim()
    setRenaming(false)
    if (!name || name === entry.displayName) {
      setDraftName(entry.displayName)
      return
    }
    if (entry.scope === 'project' && entry.projectId) {
      await p.handleRenameProjectAsset(entry.projectId, name)
    } else if (entry.scope === 'global' && entry.globalId) {
      await p.handleRenameGlobalAsset(entry.globalId, name)
    }
  }

  async function confirmDelete() {
    setConfirmingDelete(false)
    if (entry.scope === 'project' && entry.projectId) {
      p.handleDeleteProjectAsset(entry.projectId)
    } else if (entry.scope === 'global' && entry.globalId) {
      await p.handleDeleteGlobalAsset(entry.globalId)
    }
  }

  return (
    <div
      className="group relative aspect-square"
      onMouseEnter={enter}
      onMouseLeave={leave}
      draggable={!renaming}
      onDragStart={e => {
        e.dataTransfer.setData(ASSET_DND_ENTRY, writeAssetDnd(entry))
        e.dataTransfer.effectAllowed = 'copy'
      }}
    >
      <button
        type="button"
        title={`拖到画布直接使用: ${entry.displayName}`}
        className={cn(
          'block h-full w-full cursor-grab overflow-hidden rounded-xl border bg-muted/40 transition-all active:cursor-grabbing',
          hovered ? 'border-primary shadow-md' : 'border-border',
        )}
        onClick={() => {
          // 面板里单击资产: 当前有 @ 选择上下文时等价于选中
          if (p.assetPickerFor) p.applyPickedEntry(entry)
        }}
      >
        {entry.kind === 'video' ? (
          <LazyVideo root={scrollRoot} src={entry.coverUrl} muted preload="metadata" className="h-full w-full object-cover" />
        ) : (
          <LazyThumb
            root={scrollRoot}
            src={entry.coverUrl}
            alt={entry.displayName}
            className="h-full w-full object-cover"
          />
        )}
      </button>

      {/* 类型角标 */}
      {entry.kind === 'video' && (
        <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          <Film className="h-3 w-3" />
          视频
        </span>
      )}
      {entry.kind === 'group' && (
        <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          <Layers className="h-3 w-3" />
          {entry.members.length}
        </span>
      )}

      {/* hover 操作钮 */}
      {!confirmingDelete && !renaming && (
        <div
          className={cn(
            'absolute right-1 top-1 z-20 flex items-center gap-1 transition-opacity',
            hovered ? 'opacity-100' : 'opacity-0',
          )}
        >
          <span
            title="重命名"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              setDraftName(entry.displayName)
              setRenaming(true)
            }}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border border-border bg-card/90 text-muted-foreground shadow-sm transition-colors hover:border-primary hover:text-primary"
          >
            <Pencil className="h-3 w-3" />
          </span>
          <span
            title="删除资产(画布上已有的卡片不受影响)"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              setConfirmingDelete(true)
            }}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border border-border bg-card/90 text-muted-foreground shadow-sm transition-colors hover:border-destructive hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </span>
        </div>
      )}

      {/* 删除二次确认: 浮层不超出小卡, 两个按钮上下排, 每个按钮内图标与文字始终一行 */}
      {confirmingDelete && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-1 rounded-xl border border-destructive/60 bg-card/95 px-1.5 py-1 text-center backdrop-blur">
          <p className="whitespace-nowrap text-[11px] font-medium text-card-foreground">确认删除?</p>
          <div className="flex w-full flex-col items-stretch gap-1">
            <button
              type="button"
              onClick={() => void confirmDelete()}
              className="flex h-6 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md bg-destructive px-1 text-[11px] font-medium text-destructive-foreground"
            >
              <Check className="h-3 w-3 shrink-0" />
              删除
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="flex h-6 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-border px-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3 shrink-0" />
              取消
            </button>
          </div>
        </div>
      )}

      {/* 重命名内联输入 */}
      {renaming && (
        <div className="absolute inset-x-0 bottom-0 z-30 rounded-b-xl border-t border-border bg-card/95 p-1 backdrop-blur">
          <input
            autoFocus
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void submitRename()
              if (e.key === 'Escape') {
                setRenaming(false)
                setDraftName(entry.displayName)
              }
            }}
            onBlur={() => void submitRename()}
            maxLength={120}
            onPointerDown={e => e.stopPropagation()}
            className="h-7 w-full rounded-md border border-primary bg-background px-1.5 text-[11px] text-foreground outline-none"
          />
        </div>
      )}

      {/* 悬停大图预览: 浮在面板左侧; 图片组=首图大图+组内缩略图条 */}
      {showPreview && (
        <AssetDropPreview entry={entry} />
      )}
    </div>
  )
})
