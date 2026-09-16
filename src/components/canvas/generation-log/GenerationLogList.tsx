import { ScrollText } from 'lucide-react'
import type { GenLogEntry } from '@/pages/Canvas/canvasTypes'
import { GenerationLogCard } from './GenerationLogCard'

interface GenerationLogListProps {
  items: GenLogEntry[]
  onPreview: (url: string, mediaType: 'image' | 'video') => void
}

/** 中部日志列表: 独立滚动; 空态给虚线占位 */
export function GenerationLogList({ items, onPreview }: GenerationLogListProps) {
  if (!items.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/40">
          <ScrollText className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">还没有生成日志</p>
          <p className="mt-1 text-xs text-muted-foreground">在画布上运行生成节点、分层、复刻或视频任务后, 这里会记录每一次结果。</p>
        </div>
      </div>
    )
  }
  return (
    <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-muted/20 p-3">
      {items.map(entry => (
        <GenerationLogCard
          key={entry.id}
          entry={entry}
          onPreview={onPreview}
        />
      ))}
    </div>
  )
}
