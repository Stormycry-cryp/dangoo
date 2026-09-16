import { Loader2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { LodThumb } from '@/components/canvas/NodeBarShared'
import { POLISH_LLM_OPTIONS } from '@/pages/Canvas/useCanvas'
import type { CanvasCardData } from '@/pages/Canvas/useCanvas'
import type { useCanvas } from '@/pages/Canvas/useCanvas'

type CanvasVm = ReturnType<typeof useCanvas>

export function PolishNodeBody({ p, card }: { p: CanvasVm; card: CanvasCardData }) {
  const polishState = card.polishState
  // busy 含同步重入锁, 点击当帧第二下也点不动
  const busy = polishState?.jobStatus === 'running' || p.isRunInflight(`polish:${card.id}`)
  // 图片输入: 下游生成节点图 + 上游连线图; 有图时看图反推 / 结合图润色
  const source = card.sourceCardId ? p.cards.find(c => c.id === card.sourceCardId) : undefined
  const imgs = Array.from(new Set([...(source?.url ? [source.url] : []), ...p.upstreamImageUrls(card.id)])).slice(0, 4)
  const reverseMode = imgs.length > 0 && !(card.prompt ?? '').trim()
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3" onDoubleClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-card-foreground">提示词润色</p>
          <p className="mt-1 text-xs text-muted-foreground">读取右侧生成节点的描述并回填; 连接图片后可看图反推</p>
        </div>
        <Wand2 className="h-4 w-4 text-primary" />
      </div>
      {imgs.length > 0 && (
        <div className="flex items-center gap-1.5">
          {imgs.map(u => (
            <LodThumb key={u} url={u} alt="图片输入" className="h-8 w-8 shrink-0 rounded-md border border-border object-cover" />
          ))}
          <span className="text-xs text-muted-foreground">{reverseMode ? '将看图反推提示词' : '结合图片润色'}</span>
        </div>
      )}
      <textarea
        value={card.prompt ?? ''}
        onChange={e => p.updateCard(card.id, { prompt: e.target.value })}
        placeholder="待润色的提示词…"
        className="min-h-24 flex-1 resize-none rounded-lg border border-border bg-background/60 p-2 font-sans text-xs leading-relaxed text-card-foreground outline-none placeholder:text-muted-foreground/70 focus:ring-1 focus:ring-primary"
      />
      <div className="flex items-center gap-2">
        <Select
          value={polishState?.model ?? 'doubao-seed-2.0-lite'}
          onValueChange={model => p.updateCard(card.id, { polishState: { ...(polishState ?? { model: 'doubao-seed-2.0-lite', jobStatus: 'idle', result: '', errorMsg: null }), model } })}
        >
          <SelectTrigger className="h-8 min-w-0 flex-1 border-border/60 bg-background/40 text-xs">
            <span className="truncate">{POLISH_LLM_OPTIONS.find(o => o.slug === (polishState?.model ?? 'doubao-seed-2.0-lite'))?.label ?? '豆包 Seed 2.0 Lite'}</span>
          </SelectTrigger>
          <SelectContent>{POLISH_LLM_OPTIONS.map(o => <SelectItem key={o.slug} value={o.slug}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" disabled={busy} onClick={() => void p.handleRunPolishNode(card.id)} className="h-8 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          <span className="ml-1">{busy ? (reverseMode ? '反推中' : '润色中') : reverseMode ? '开始反推' : '开始润色'}</span>
        </Button>
      </div>
      {polishState?.jobStatus === 'failed' && <p className="text-xs leading-relaxed text-destructive">{polishState.errorMsg}</p>}
      {polishState?.jobStatus === 'success' && <p className="text-xs text-primary">已回填到生成节点</p>}
    </div>
  )
}
