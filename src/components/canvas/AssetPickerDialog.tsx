import { Loader2, Layers, Upload, Film } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { useCanvas } from '@/pages/Canvas/useCanvas'
import { mediaSrc } from '@/lib/media'
import type { AssetLibEntry } from '@/components/canvas/asset-library/assetLib'

type CanvasVm = ReturnType<typeof useCanvas>

function PickerAssetCard({ entry, onPick }: { entry: AssetLibEntry; onPick: (e: AssetLibEntry) => void }) {
  return (
    <button
      key={entry.key}
      title={entry.displayName}
      onClick={() => onPick(entry)}
      className="group relative overflow-hidden rounded-lg border border-border transition-all hover:scale-105 hover:border-primary hover:shadow-md"
    >
      {entry.kind === 'video' ? (
        <video src={mediaSrc(entry.coverUrl)} muted preload="metadata" className="aspect-square w-full object-cover" />
      ) : (
        <img src={mediaSrc(entry.coverUrl)} alt={entry.displayName} loading="lazy" className="aspect-square w-full object-cover" />
      )}
      {entry.kind === 'video' && (
        <span className="pointer-events-none absolute bottom-1 right-1 flex items-center gap-0.5 rounded-md bg-black/55 px-1 py-0.5 text-[10px] text-white">
          <Film className="h-2.5 w-2.5" />
          视频
        </span>
      )}
      {entry.kind === 'group' && (
        <span className="pointer-events-none absolute bottom-1 right-1 flex items-center gap-0.5 rounded-md bg-black/55 px-1 py-0.5 text-[10px] text-white">
          <Layers className="h-2.5 w-2.5" />
          {entry.members.length}
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-0.5 pt-3 text-left text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
        {entry.displayName}
      </span>
    </button>
  )
}

export function AssetPickerDialog({ p }: { p: CanvasVm }) {
  const open = p.assetPickerFor !== null
  const forNodeImage = p.assetPickerFor?.slot === 'node'
  // 关闭态直接返回: 旧实现即使 Dialog 不挂 Portal, 也会在每次画布状态变化时
  // 提前构建 pickerEntries.map(...) 的整组网格元素(纯 React 层的固定开销)
  if (!open) return null
  return (
    <Dialog open={open} onOpenChange={v => !v && p.setAssetPickerFor(null)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{forNodeImage ? '素材库 · 选节点图片' : '素材库 · 选参考图'}</DialogTitle>
          <DialogDescription>
            {forNodeImage
              ? '点击素材, 把它设为当前生成节点的图片, 图生图/图生视频时作为参考图或首帧; 也可以直接上传新素材。'
              : '点击素材, 把它作为当前卡片的参考图参与后续生成; 图片组会把组内全部图片作为参考图。'}
          </DialogDescription>
        </DialogHeader>

        {/* 全局 / 本项目 范围切换 */}
        <div className="flex items-center gap-1 self-start rounded-lg bg-muted p-0.5 text-xs">
          {(['global', 'project'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => p.setPickerScope(s)}
              className={cn(
                'rounded-md px-3 py-1 font-medium transition-all',
                p.pickerScope === s ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s === 'global' ? '全局' : '本项目'}
            </button>
          ))}
        </div>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground transition-colors hover:border-primary hover:bg-muted/50">
          {p.assetUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {p.assetUploading ? '上传中…' : '上传新素材到全局素材库'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              void p.handleUploadAsset(e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
        </label>
        {p.pickerEntries.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {p.pickerScope === 'project'
              ? '项目资产库还是空的: 打开右侧资产库, 把画布上的图片拖进去保存。'
              : '素材库还是空的: 上传一张图, 或把生成结果存进来。'}
          </p>
        ) : (
          <div className="grid max-h-96 grid-cols-4 gap-2 overflow-y-auto py-1">
            {p.pickerEntries.map(entry => (
              <PickerAssetCard key={entry.key} entry={entry} onPick={p.applyPickedEntry} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
