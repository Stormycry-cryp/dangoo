import { Blend, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LodThumb } from '@/components/canvas/NodeBarShared'
import type { CanvasCardData } from '@/pages/Canvas/useCanvas'
import type { useCanvas } from '@/pages/Canvas/useCanvas'

type CanvasVm = ReturnType<typeof useCanvas>

/** 图像融合节点卡体: 左接完整原图, 右接多张提取的局部修改图, 羽化叠回原图 */
export function MergeNodeBody({ p, card }: { p: CanvasVm; card: CanvasCardData }) {
  const st = card.mergeState ?? { colorMatch: true }
  const running = !!st.running
  const inputs = p.mergeInputs(card.id)
  const blocked = !!inputs.error || running

  return (
    // 不在根部拦截按下: 卡体空白处(原图/局部图展示区)也要能直接拖动整张卡;
    // 两个按钮已在画布拖动入口的控件名单中, 点击不会误启动拖拽
    <div
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5"
      onDoubleClick={e => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between">
        <p className="text-sm font-semibold text-card-foreground">图像融合</p>
        <Blend className="h-4 w-4 text-primary" />
      </div>

      {/* 原图区 */}
      <div className="shrink-0">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">原图</p>
        {inputs.original ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-1.5">
            <LodThumb url={inputs.original.url} alt="原图" className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" />
            <span className="truncate text-xs text-card-foreground">完整原图已连接</span>
          </div>
        ) : (
          <div className="flex h-12 items-center justify-center rounded-lg border border-dashed border-border bg-background/40 px-2 text-center text-xs text-muted-foreground">
            连接一张完整原图
          </div>
        )}
      </div>

      {/* 局部修改区 */}
      <div className="shrink-0">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">局部修改图</p>
        {inputs.patches.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-muted/30 p-1.5">
            {inputs.patches.map((pt, i) => (
              <span key={`${pt.card.id}-${i}`} className="relative">
                <LodThumb url={pt.url} alt={`局部图 ${i + 1}`} className="h-10 w-10 rounded-md border border-border object-cover" />
                <span className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {i + 1}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <div className="flex h-12 items-center justify-center rounded-lg border border-dashed border-border bg-background/40 px-2 text-center text-xs text-muted-foreground">
            连接提取的局部图
          </div>
        )}
      </div>

      {/* 状态 / 错误 */}
      <div className="shrink-0">
        {st.error ? (
          <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs leading-relaxed text-destructive">{st.error}</p>
        ) : inputs.error ? (
          <p className="rounded-md bg-muted px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">{inputs.error}</p>
        ) : (
          <p className="px-1 text-xs text-muted-foreground">{inputs.patches.length} 张局部图待融合</p>
        )}
      </div>

      {/* 颜色匹配开关 + 融合按钮 */}
      <div className="mt-auto shrink-0 space-y-2 pt-1">
        <button
          type="button"
          onClick={() => p.setMergeColorMatch(card.id, !st.colorMatch)}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-background/40 px-2.5 py-1.5 text-xs text-card-foreground transition-colors hover:border-primary"
        >
          <span>环带颜色匹配</span>
          <span
            className={`relative h-4 w-7 rounded-full transition-colors ${st.colorMatch ? 'bg-primary' : 'bg-muted'}`}
            aria-label="颜色匹配开关"
          >
            <span
              className={`absolute top-0.5 h-3 w-3 rounded-full bg-card shadow transition-all ${st.colorMatch ? 'left-3.5' : 'left-0.5'}`}
            />
          </span>
        </button>
        <Button
          size="sm"
          disabled={blocked}
          onClick={() => void p.handleRunMerge(card.id)}
          className="h-8 w-full gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Blend className="h-3.5 w-3.5" />}
          {running ? '融合中…' : '开始融合'}
        </Button>
      </div>
    </div>
  )
}
