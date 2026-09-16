import { Workflow } from 'lucide-react'
import type { AssetLibEntry } from './assetLib'
import { LazyThumb } from './LazyThumb'
import { PresetCoverArt } from './PresetCoverArt'

/** 节点类型 -> 示意块配色/文案(纯 CSS 示意, 不渲染真实卡片/连线) */
function nodeVisual(kind: string): { label: string; cls: string } {
  switch (kind) {
    case 'generate':
      return { label: '生成', cls: 'bg-primary text-primary-foreground' }
    case 'prompt':
      return { label: '提示词', cls: 'bg-secondary text-secondary-foreground' }
    case 'result':
      return { label: '图片', cls: 'bg-muted text-muted-foreground' }
    case 'video':
      return { label: '视频', cls: 'bg-muted text-muted-foreground' }
    case 'agent':
      return { label: 'Agent', cls: 'bg-secondary text-secondary-foreground' }
    case 'loop':
      return { label: '循环', cls: 'bg-secondary text-secondary-foreground' }
    case 'merge':
      return { label: '融合', cls: 'bg-secondary text-secondary-foreground' }
    case 'polish':
      return { label: '润色', cls: 'bg-secondary text-secondary-foreground' }
    case 'layer':
      return { label: '分层', cls: 'bg-secondary text-secondary-foreground' }
    case 'replicate':
      return { label: '复刻', cls: 'bg-secondary text-secondary-foreground' }
    case 'tts':
      return { label: '语音', cls: 'bg-primary text-primary-foreground' }
    case 'motion':
      return { label: '动作', cls: 'bg-primary text-primary-foreground' }
    case 'vsr':
      return { label: '修复', cls: 'bg-primary text-primary-foreground' }
    default:
      return { label: '节点', cls: 'bg-muted text-muted-foreground' }
  }
}

/** 悬停约 0.5s 后在面板左侧浮出的工作流预览: 封面首图 + 节点/连线数 + 纯 CSS 链路示意 */
export function WorkflowDropPreview({ entry }: { entry: AssetLibEntry }) {
  const doc = entry.workflow
  const nodes = doc?.nodes ?? []
  const edgeCount = doc?.edges.length ?? 0
  // 示意顺序: 按 x 再按 y 排, 最多展示 8 个块, 超出 +N
  const ordered = [...nodes].sort((a, b) => a.x - b.x || a.y - b.y).slice(0, 8)
  const overflow = nodes.length - ordered.length

  return (
    <div className="pointer-events-none fixed right-[336px] top-1/2 z-[70] w-72 -translate-y-1/2 animate-in fade-in zoom-in-95 duration-200">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="relative aspect-square">
          {entry.preset ? (
            <PresetCoverArt entry={entry} />
          ) : entry.coverUrl ? (
            <LazyThumb
              src={entry.coverUrl}
              alt={entry.displayName}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted/40">
              <Workflow className="h-14 w-14 text-muted-foreground/50" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 border-t border-border/70 px-2.5 py-2">
          <Workflow className="h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-card-foreground">{entry.displayName}</p>
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {nodes.length} 个节点 · {edgeCount} 条连线
          </span>
          {entry.priceText && (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {entry.priceText}
            </span>
          )}
        </div>
        {/* 纯 CSS 链路示意: 圆点/方块 + 箭头, 不渲染真实图片与连线 */}
        <div className="flex flex-wrap items-center gap-1 border-t border-border/70 bg-muted/30 p-2">
          {ordered.map((n, i) => {
            const v = nodeVisual(n.kind)
            return (
              <span key={`${n.id}-${i}`} className="flex items-center gap-1">
                {i > 0 && <span className="text-[10px] text-muted-foreground">→</span>}
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${v.cls}`}>{v.label}</span>
              </span>
            )
          })}
          {overflow > 0 && <span className="px-1 text-[10px] text-muted-foreground">+{overflow}</span>}
          {!ordered.length && <span className="text-[10px] text-muted-foreground">空工作流</span>}
        </div>
      </div>
    </div>
  )
}
