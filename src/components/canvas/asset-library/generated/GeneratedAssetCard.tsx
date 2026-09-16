import { memo, useState } from 'react'
import { Check, Download, Film, Link2, Music, Play, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LazyThumb } from '../LazyThumb'
import type { GeneratedAsset } from './generatedAssetsTypes'

/** 单个产物卡: 缩略图 / 类型角标 / hover 勾选 / 单条操作 / 底部项目名 */
export const GeneratedAssetCard = memo(function GeneratedAssetCard({
  asset,
  selected,
  busy,
  scrollRoot,
  onOpen,
  onToggleSelect,
  onSave,
  onCopyLink,
  onDownload,
}: {
  asset: GeneratedAsset
  selected: boolean
  /** 该条正在存入素材库 */
  busy?: boolean
  scrollRoot?: HTMLElement | null
  onOpen: (asset: GeneratedAsset) => void
  onToggleSelect: (asset: GeneratedAsset) => void
  onSave: (asset: GeneratedAsset) => void
  onCopyLink: (asset: GeneratedAsset) => void
  onDownload: (asset: GeneratedAsset) => void
}) {
  const [failed, setFailed] = useState(false)

  const kindBadge =
    asset.kind === 'video' ? (
      <>
        <Film className="h-3 w-3" />
        视频
      </>
    ) : asset.kind === 'audio' ? (
      <>
        <Music className="h-3 w-3" />
        音频
      </>
    ) : null

  return (
    <div className={cn('group relative aspect-square select-none', selected && 'z-10')}>
      <button
        type="button"
        title={`${asset.canvasTitle} · ${asset.nodeType || '生成节点'}`}
        onClick={() => onOpen(asset)}
        className={cn(
          'block h-full w-full overflow-hidden rounded-xl border bg-muted/40 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          selected ? 'border-primary ring-2 ring-primary/50' : 'border-border hover:border-primary/70',
        )}
      >
        {asset.kind === 'image' ? (
          failed ? (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Film className="h-5 w-5" />
            </div>
          ) : (
            <LazyThumb
              root={scrollRoot}
              src={asset.url}
              alt={asset.prompt || '生成图片'}
              onError={() => setFailed(true)}
              className="h-full w-full object-cover"
            />
          )
        ) : (
          <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-background">
            {asset.kind === 'video' && !failed ? (
              <LazyThumb
                root={scrollRoot}
                src={asset.url}
                alt={asset.prompt || '生成视频'}
                onError={() => setFailed(true)}
                className="absolute inset-0 h-full w-full object-cover opacity-70"
              />
            ) : null}
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white shadow-md backdrop-blur-sm">
              {asset.kind === 'video' ? (
                <Play className="ml-0.5 h-4 w-4 fill-current" />
              ) : (
                <Music className="h-4 w-4" />
              )}
            </span>
          </div>
        )}
      </button>

      {/* 类型角标(视频/音频), 图片不显示 */}
      {kindBadge && (
        <span className="pointer-events-none absolute right-1.5 top-1.5 z-10 mr-7 flex items-center gap-0.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm group-hover:opacity-0">
          {kindBadge}
        </span>
      )}

      {/* hover / 选中态勾选框 */}
      <button
        type="button"
        aria-label={selected ? '取消选择' : '选择这项'}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation()
          onToggleSelect(asset)
        }}
        className={cn(
          'absolute left-1.5 top-1.5 z-20 flex h-5 w-5 items-center justify-center rounded-md border shadow-sm transition-all',
          selected
            ? 'border-primary bg-primary text-primary-foreground opacity-100'
            : 'border-border bg-card/90 text-transparent opacity-0 hover:border-primary group-hover:opacity-100',
        )}
      >
        <Check className="h-3.5 w-3.5" />
      </button>

      {/* 单条操作: hover 显示(已选中时让位给批量操作条) */}
      {!selected && (
        <div className="absolute bottom-6 left-1.5 right-1.5 z-20 flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <span
            title="存入素材库"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              onSave(asset)
            }}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border border-border bg-card/90 text-muted-foreground shadow-sm transition-colors hover:border-primary hover:text-primary"
          >
            {busy ? <Check className="h-3 w-3 text-primary" /> : <Save className="h-3 w-3" />}
          </span>
          <span
            title="复制链接"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              onCopyLink(asset)
            }}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border border-border bg-card/90 text-muted-foreground shadow-sm transition-colors hover:border-primary hover:text-primary"
          >
            <Link2 className="h-3 w-3" />
          </span>
          <span
            title="下载"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              onDownload(asset)
            }}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border border-border bg-card/90 text-muted-foreground shadow-sm transition-colors hover:border-primary hover:text-primary"
          >
            <Download className="h-3 w-3" />
          </span>
        </div>
      )}

      {/* 底部项目名 */}
      <p className="pointer-events-none absolute inset-x-0 bottom-0 truncate rounded-b-xl bg-gradient-to-t from-black/65 to-transparent px-1.5 pb-0.5 pt-3 text-[10px] text-white/90">
        {asset.canvasTitle}
      </p>
    </div>
  )
})
