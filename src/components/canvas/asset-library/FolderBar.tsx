import { useEffect, useRef, useState } from 'react'
import { Check, FolderPlus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { useCanvas } from '@/pages/Canvas/useCanvas'

type CanvasVm = ReturnType<typeof useCanvas>
type Scope = 'project' | 'global'

/** 文件夹行: 库范围分段 + 文件夹下拉(全部/未分类/各文件夹) + 新建 + 当前文件夹重命名/删除 */
export function FolderBar({
  p,
  scope,
  onScopeChange,
  folderId,
  onFolderChange,
}: {
  p: CanvasVm
  scope: Scope
  onScopeChange: (scope: Scope) => void
  folderId: string
  onFolderChange: (id: string) => void
}) {
  const folders =
    scope === 'project'
      ? p.projectAssets.folders
      : p.globalFolders.map(f => ({ id: f.id, name: f.name ?? '未命名文件夹' }))
  const current = folders.find(f => f.id === folderId) ?? null
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [menuOpen])

  useEffect(() => {
    if (creating || renaming) inputRef.current?.focus()
  }, [creating, renaming])

  async function submitCreate() {
    const name = draftName.trim()
    setDraftName('')
    setCreating(false)
    if (!name) return
    const id = await p.handleCreateFolder(scope, name)
    if (id) onFolderChange(id)
  }

  async function submitRename() {
    const name = renameDraft.trim()
    setRenaming(false)
    setRenameDraft('')
    if (!name || !current) return
    await p.handleRenameFolder(scope, current.id, name)
  }

  async function confirmDelete() {
    if (!current) return
    setMenuOpen(false)
    const ok = window.confirm(`删除文件夹「${current.name}」? 文件夹里的资产会移到「未分类」, 不会被删除。`)
    if (ok) {
      await p.handleDeleteFolder(scope, current.id)
      onFolderChange('')
    }
  }

  return (
    <div className="shrink-0 space-y-2 border-b border-border/70 px-3 py-2.5">
      {/* 资产库范围分段 */}
      <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-0.5 text-xs">
        {(['project', 'global'] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => onScopeChange(s)}
            className={cn(
              'flex-1 rounded-md px-2 py-1 font-medium transition-all',
              scope === s ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {s === 'project' ? '项目资产库' : '全局资产库'}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {creating ? (
          <div className="flex flex-1 items-center gap-1">
            <input
              ref={inputRef}
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void submitCreate()
                if (e.key === 'Escape') {
                  setCreating(false)
                  setDraftName('')
                }
              }}
              onBlur={() => void submitCreate()}
              maxLength={100}
              placeholder="文件夹名称"
              className="h-8 min-w-0 flex-1 rounded-lg border border-primary bg-card px-2 text-xs text-card-foreground outline-none"
            />
            <button
              type="button"
              title="确认"
              onMouseDown={e => e.preventDefault()}
              onClick={() => void submitCreate()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        ) : renaming && current ? (
          <div className="flex flex-1 items-center gap-1">
            <input
              ref={inputRef}
              value={renameDraft}
              onChange={e => setRenameDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void submitRename()
                if (e.key === 'Escape') {
                  setRenaming(false)
                  setRenameDraft('')
                }
              }}
              onBlur={() => void submitRename()}
              maxLength={100}
              className="h-8 min-w-0 flex-1 rounded-lg border border-primary bg-card px-2 text-xs text-card-foreground outline-none"
            />
            <button
              type="button"
              title="确认"
              onMouseDown={e => e.preventDefault()}
              onClick={() => void submitRename()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Select value={folderId || '__all__'} onValueChange={v => onFolderChange(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-8 min-w-0 flex-1 border-border/70 bg-card text-xs shadow-none">
              <SelectValue placeholder="全部资产" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部资产</SelectItem>
              <SelectItem value="uncategorized">未分类</SelectItem>
              {folders.map(f => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {!creating && (
          <button
            type="button"
            title="新建文件夹"
            onClick={() => {
              setRenaming(false)
              setCreating(true)
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
        )}

        {current && !creating && !renaming && (
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              title="文件夹操作"
              onClick={() => setMenuOpen(v => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-9 z-50 w-32 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    setRenameDraft(current.name)
                    setRenaming(true)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-card-foreground transition-colors hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  重命名
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDelete()}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除文件夹
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {p.foldersLoading && scope === 'global' && (
        <p className="text-[11px] text-muted-foreground">文件夹加载中…</p>
      )}
    </div>
  )
}
