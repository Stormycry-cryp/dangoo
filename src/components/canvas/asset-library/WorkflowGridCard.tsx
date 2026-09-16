import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, Sparkles, Trash2, Workflow, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { useCanvas } from '@/pages/Canvas/useCanvas'
import { ASSET_DND_ENTRY, writeAssetDnd, type AssetLibEntry } from './assetLib'
import { LazyThumb } from './LazyThumb'
import { PresetCoverArt } from './PresetCoverArt'
import { WorkflowDropPreview } from './WorkflowDropPreview'

const HOVER_PREVIEW_DELAY = 500

/** 工作流资产卡: 正方形工作流图标封面 + 节点数角标 + 名称; hover 预览 / 重命名 / 删除(二次确认) / 拖回画布 */
export function WorkflowGridCard({ p, entry }: { p: ReturnType<typeof useCanvas>; entry: AssetLibEntry }) {
  const [hovered, setHovered] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(entry.displayName)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 快速滚动/重渲染卸载时清理悬停预览定时器, 防浮层错位
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }, [])

  const nodeCount = entry.workflow?.nodes.length ?? 0

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
        title={`拖到画布重建整条工作流: ${entry.displayName}`}
        className={cn(
          'flex h-full w-full cursor-grab flex-col overflow-hidden rounded-xl border bg-muted/40 transition-all active:cursor-grabbing',
          hovered ? 'border-primary shadow-md' : 'border-border',
        )}
      >
        {/* 封面: 有封面图显示图片, 无则居中大图标 */}
        <div className="relative min-h-0 flex-1">
          {entry.coverUrl ? (
            <LazyThumb src={entry.coverUrl} alt={entry.displayName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted/50">
              <Workflow className="h-8 w-8 text-muted-foreground/60" />
            </div>
          )}
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <Workflow className="h-3 w-3" />
            {nodeCount}
          </span>
        </div>
        {/* 名称卡底一行截断 */}
        <div className="flex h-6 shrink-0 items-center border-t border-border/60 bg-card px-1.5">
          <span className="w-full truncate text-[10px] text-muted-foreground">{entry.displayName}</span>
        </div>
      </button>

      {/* hover 操作钮(内置预设不可重命名/删除, 双保险: 预设正常也不会渲染本组件) */}
      {!confirmingDelete && !renaming && !entry.preset && (
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
            title="删除工作流(画布上已有的节点不受影响)"
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

      {/* 删除二次确认: 两个按钮上下排, 每个按钮内图标与文字始终一行 */}
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

      {/* 悬停大图预览: 浮在面板左侧 */}
      {showPreview && <WorkflowDropPreview entry={entry} />}
    </div>
  )
}

/**
 * 内置预设工作流卡: 整张卡就是设计封面(名称与价格排进封面内),
 * 不可重命名/删除; 拖到画布与普通工作流走同一条重建链路。
 */
export function PresetWorkflowCard({ entry }: { entry: AssetLibEntry }) {
  const [hovered, setHovered] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }, [])
  const nodeCount = entry.workflow?.nodes.length ?? 0

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

  return (
    <div
      className="group relative aspect-square"
      onMouseEnter={enter}
      onMouseLeave={leave}
      draggable
      onDragStart={e => {
        e.dataTransfer.setData(ASSET_DND_ENTRY, writeAssetDnd(entry))
        e.dataTransfer.effectAllowed = 'copy'
      }}
    >
      <button
        type="button"
        title={`拖到画布使用: ${entry.displayName}`}
        className={cn(
          'h-full w-full cursor-grab overflow-hidden rounded-xl border transition-all active:cursor-grabbing',
          hovered ? 'border-primary shadow-lg shadow-primary/10' : 'border-border',
        )}
      >
        <PresetCoverArt entry={entry} />
      </button>

      {/* 预设徽标 + 节点数浮在封面上 */}
      <span className="pointer-events-none absolute left-1.5 top-1.5 z-10 flex items-center gap-0.5 rounded-full border border-primary/25 bg-card/80 px-1.5 py-0.5 text-[10px] font-medium text-primary backdrop-blur-sm">
        <Sparkles className="h-3 w-3" />
        预设
      </span>
      <span className="pointer-events-none absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
        <Workflow className="h-3 w-3" />
        {nodeCount}
      </span>

      {showPreview && <WorkflowDropPreview entry={entry} />}
    </div>
  )
}
