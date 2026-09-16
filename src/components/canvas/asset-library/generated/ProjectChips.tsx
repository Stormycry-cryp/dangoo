import { useMemo } from 'react'
import { FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GeneratedAsset } from './generatedAssetsTypes'

export interface ProjectChip {
  canvasId: string
  title: string
  count: number
}

/** 从全部产物里统计每项目产物数(项目顺序: 产物最新时间倒序) */
export function buildProjectChips(assets: GeneratedAsset[]): ProjectChip[] {
  const map = new Map<string, { title: string; count: number; latest: number }>()
  for (const asset of assets) {
    const cur = map.get(asset.canvasId)
    if (cur) {
      cur.count += 1
      if (asset.createdAt > cur.latest) cur.latest = asset.createdAt
    } else {
      map.set(asset.canvasId, { title: asset.canvasTitle, count: 1, latest: asset.createdAt })
    }
  }
  return Array.from(map.entries())
    .map(([canvasId, v]) => ({ canvasId, title: v.title, count: v.count }))
    .sort((a, b) => {
      const la = map.get(a.canvasId)?.latest ?? 0
      const lb = map.get(b.canvasId)?.latest ?? 0
      return lb - la
    })
}

/** 项目 chip 横滑筛选: 「全部项目」在前, 其后按产物最新时间倒序 */
export function ProjectChips({
  assets,
  selectedProjectId,
  onSelect,
}: {
  assets: GeneratedAsset[]
  selectedProjectId: string
  onSelect: (canvasId: string) => void
}) {
  const chips = useMemo(() => buildProjectChips(assets), [assets])
  if (chips.length === 0) return null
  const total = assets.length
  return (
    <div className="shrink-0 overflow-x-auto border-b border-border/70 [scrollbar-width:thin]">
      <div className="flex w-max items-center gap-1.5 px-3 py-2">
        <button
          type="button"
          onClick={() => onSelect('')}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
            selectedProjectId === ''
              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
              : 'border-border bg-card text-muted-foreground hover:border-primary hover:text-primary',
          )}
        >
          <FolderOpen className="h-3 w-3" />
          全部项目
          <span className={selectedProjectId === '' ? 'text-primary-foreground/80' : 'text-muted-foreground/70'}>
            {total}
          </span>
        </button>
        {chips.map(chip => (
          <button
            key={chip.canvasId}
            type="button"
            title={chip.title}
            onClick={() => onSelect(chip.canvasId === selectedProjectId ? '' : chip.canvasId)}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
              selectedProjectId === chip.canvasId
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-border bg-card text-muted-foreground hover:border-primary hover:text-primary',
            )}
          >
            <span className="max-w-28 truncate">{chip.title}</span>
            <span className={selectedProjectId === chip.canvasId ? 'text-primary-foreground/80' : 'text-muted-foreground/70'}>
              {chip.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
