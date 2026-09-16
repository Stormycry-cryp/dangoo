import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GenerationLogPagerProps {
  page: number
  totalPages: number
  totalCount: number
  onPrev: () => void
  onNext: () => void
  onGoPage: (page: number) => void
}

/** 底部分页栏: 上一页/下一页 + 页码(超过 7 页时首尾与当前页附近保留, 中间省略) */
export function GenerationLogPager({ page, totalPages, totalCount, onPrev, onNext, onGoPage }: GenerationLogPagerProps) {
  const pageNumbers: Array<number | 'gap'> = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i += 1) pageNumbers.push(i)
  } else {
    pageNumbers.push(1)
    if (page > 3) pageNumbers.push('gap')
    const start = Math.max(2, page - 1)
    const end = Math.min(totalPages - 1, page + 1)
    for (let i = start; i <= end; i += 1) pageNumbers.push(i)
    if (page < totalPages - 2) pageNumbers.push('gap')
    pageNumbers.push(totalPages)
  }

  const navBtn =
    'flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground'

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card/95 px-4 py-2.5">
      <p className="text-xs text-muted-foreground">
        共 <span className="font-medium text-foreground">{totalCount}</span> 条
      </p>
      <div className="flex items-center gap-1.5">
        <button type="button" title="上一页" onClick={onPrev} disabled={page <= 1} className={navBtn}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageNumbers.map((n, idx) =>
          n === 'gap' ? (
            <span key={`gap-${idx}`} className="px-1 text-xs text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onGoPage(n)}
              className={cn(
                'h-8 min-w-8 rounded-md border px-2 text-xs font-medium transition-colors',
                n === page
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border text-muted-foreground hover:border-primary hover:text-primary',
              )}
            >
              {n}
            </button>
          ),
        )}
        <button type="button" title="下一页" onClick={onNext} disabled={page >= totalPages} className={navBtn}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <p className="w-20 text-right text-xs text-muted-foreground">
        第 {page} / {totalPages} 页
      </p>
    </div>
  )
}
