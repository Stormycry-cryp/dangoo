import { ArrowDownWideNarrow, Film, Images, Music, Search, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssetKindFilter, AssetSortOrder } from './generatedAssetsTypes'

const TYPE_TABS: Array<{
  key: AssetKindFilter
  label: string
  icon: typeof Images
}> = [
  { key: 'all', label: '全部', icon: LayoutGrid },
  { key: 'image', label: '图片', icon: Images },
  { key: 'video', label: '视频', icon: Film },
  { key: 'audio', label: '音频', icon: Music },
]

/** 筛选条: 类型 segmented(带数量角标) + 关键词搜索 + 排序 */
export function GeneratedAssetFilters({
  kindFilter,
  onKindChange,
  keyword,
  onKeywordChange,
  sortOrder,
  onSortChange,
  counts,
}: {
  kindFilter: AssetKindFilter
  onKindChange: (kind: AssetKindFilter) => void
  keyword: string
  onKeywordChange: (value: string) => void
  sortOrder: AssetSortOrder
  onSortChange: (order: AssetSortOrder) => void
  counts: { all: number; image: number; video: number; audio: number }
}) {
  return (
    <div className="shrink-0 space-y-2 border-b border-border/70 px-3 py-2.5">
      <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1">
        {TYPE_TABS.map(tab => {
          const active = kindFilter === tab.key
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onKindChange(tab.key)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-xs font-medium transition-all',
                active ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{tab.label}</span>
              <span
                className={cn(
                  'rounded-full px-1 text-[10px] leading-4',
                  active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                {counts[tab.key]}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={keyword}
            onChange={e => onKeywordChange(e.target.value)}
            placeholder="搜提示词、模型、项目"
            className="h-8 w-full min-w-0 rounded-lg border border-border bg-muted/40 pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>
        <button
          type="button"
          title={sortOrder === 'newest' ? '当前: 最新在前' : '当前: 最旧在前'}
          onClick={() => onSortChange(sortOrder === 'newest' ? 'oldest' : 'newest')}
          className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <ArrowDownWideNarrow className={cn('h-3.5 w-3.5 transition-transform', sortOrder === 'oldest' && 'rotate-180')} />
          {sortOrder === 'newest' ? '最新' : '最旧'}
        </button>
      </div>
    </div>
  )
}
