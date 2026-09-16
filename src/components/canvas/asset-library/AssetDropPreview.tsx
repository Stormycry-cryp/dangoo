import { Film, Layers } from 'lucide-react'
import { mediaSrc } from '@/lib/media'
import type { AssetLibEntry } from './assetLib'

/** 悬停约 0.5s 后在面板左侧浮出的大图预览; 图片组显示首图大图 + 组内缩略图条 */
export function AssetDropPreview({ entry }: { entry: AssetLibEntry }) {
  const groupThumbs = entry.kind === 'group' ? entry.members.slice(0, 10) : []
  return (
    <div className="pointer-events-none fixed right-[336px] top-1/2 z-[70] w-72 -translate-y-1/2 animate-in fade-in zoom-in-95 duration-200">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex aspect-square items-center justify-center bg-muted/40">
          {entry.kind === 'video' ? (
            <video src={mediaSrc(entry.coverUrl)} muted autoPlay loop playsInline preload="metadata" className="h-full w-full object-contain" />
          ) : (
            <img src={mediaSrc(entry.coverUrl)} alt={entry.displayName} className="h-full w-full object-contain" />
          )}
        </div>
        <div className="flex items-center gap-1.5 border-t border-border/70 px-2.5 py-2">
          {entry.kind === 'video' ? <Film className="h-3.5 w-3.5 shrink-0 text-primary" /> : entry.kind === 'group' ? <Layers className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-card-foreground">{entry.displayName}</p>
          {entry.kind === 'video' && <span className="shrink-0 text-[10px] text-muted-foreground">视频</span>}
          {entry.kind === 'group' && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {entry.members.length} 张
            </span>
          )}
        </div>
        {groupThumbs.length > 0 && (
          <div className="flex gap-1 overflow-x-auto border-t border-border/70 bg-muted/30 p-2">
            {groupThumbs.map((m, i) => (
              <img
                key={`${m.url}-${i}`}
                src={mediaSrc(m.url)}
                alt={m.name ?? `成员 ${i + 1}`}
                className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                loading="lazy"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
