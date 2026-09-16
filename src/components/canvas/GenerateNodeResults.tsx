import { useEffect } from 'react'
import { Loader2, Maximize2, Minimize2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { LodThumb, ModelPriceText, shortModelLabel } from '@/components/canvas/NodeBarShared'
import { channelFamilyOf, defaultGenParams } from '@/pages/Canvas/useCanvas'
import type { CanvasCardData, GenerateResultItem } from '@/pages/Canvas/useCanvas'
import type { useCanvas } from '@/pages/Canvas/useCanvas'
import { mediaSrc } from '@/lib/media'

type CanvasVm = ReturnType<typeof useCanvas>

function ResultActionButton({
  title,
  onClick,
  disabled = false,
  children,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={e => {
        e.stopPropagation()
        onClick()
      }}
      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}

/** 单个结果项的失败态: 错误文案 + 单项重试 */
function ResultFailedState({ item, inflight, onRetry }: { item: GenerateResultItem; inflight?: boolean; onRetry: () => void }) {
  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-3 text-center">
      <p className="text-xs leading-relaxed text-destructive">{item.errorMsg ?? '生成失败'}</p>
      <Button
        size="sm"
        variant="outline"
        disabled={inflight}
        className="h-7 border-primary/50 px-2 text-xs text-primary hover:text-primary"
        onClick={e => {
          e.stopPropagation()
          onRetry()
        }}
      >
        {inflight ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        单项重试
      </Button>
    </div>
  )
}

/** 单个结果项的排队/生成中转圈态 */
function ResultPendingState({ item }: { item: GenerateResultItem }) {
  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-xs text-muted-foreground">{item.itemStatus === 'queued' ? '排队中…' : item.isVideo ? '视频生成中…' : '生成中…'}</p>
    </div>
  )
}

/** 缩略图条上的单格: 排队/生成中转圈, 失败显重试小钮, 成功可点击切换主图 */
function ResultThumb({
  item,
  index,
  active,
  inflight,
  onSelect,
  onRetry,
}: {
  item: GenerateResultItem
  index: number
  active: boolean
  inflight?: boolean
  onSelect: () => void
  onRetry: () => void
}) {
  if (item.itemStatus === 'queued' || item.itemStatus === 'running') {
    return (
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50"
        title={item.itemStatus === 'queued' ? `第 ${index + 1} 张排队中` : `第 ${index + 1} 张生成中`}
      >
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      </span>
    )
  }
  if (item.itemStatus === 'failed') {
    if (inflight) {
      return (
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-primary/50 bg-primary/5"
          title={`第 ${index + 1} 张重试中`}
        >
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </span>
      )
    }
    return (
      <button
        type="button"
        title={`第 ${index + 1} 张失败, 点击重试`}
        onClick={e => {
          e.stopPropagation()
          onRetry()
        }}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-destructive/50 bg-destructive/5 text-destructive transition-colors hover:bg-destructive/10"
      >
        <RefreshCw className="h-4 w-4" />
      </button>
    )
  }
  return (
    <button
      type="button"
      title={`查看第 ${index + 1} ${item.isVideo ? '个视频' : '张图'}`}
      onClick={e => {
        e.stopPropagation()
        onSelect()
      }}
      className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-md border transition-all ${
        active ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-primary/60'
      }`}
    >
      {item.isVideo ? (
        <span className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">视频</span>
      ) : item.url ? (
        <LodThumb url={item.url} alt={`结果 ${index + 1}`} className="h-full w-full object-cover" />
      ) : null}
    </button>
  )
}

/**
 * 生成节点结果区: 主区显示当前主看结果(图/视频/转圈/失败),
 * 下方缩略图条切换/重试单项, 底部浮条为渠道选择器 + 展开/重新生成 + 价格。
 * 未选中时整体随节点纯图展示; 操作按钮 hover 显现, footer 常显。
 */
export function GenerateNodeResults({ p, card }: { p: CanvasVm; card: CanvasCardData }) {
  const results = card.results ?? []
  const activeIdx = Math.min(card.activeResultIndex ?? 0, Math.max(0, results.length - 1))
  const active = results[activeIdx]
  const isVideo = p.cardShowsVideo(card)
  const activeBusy = active?.itemStatus === 'queued' || active?.itemStatus === 'running'
  const activeFailed = active?.itemStatus === 'failed'
  const activeReady = active?.itemStatus === 'success' && !!active.url

  const retryItem = (index: number) => p.handleRetryNodeResult(card.id, index)
  const selectItem = (index: number) => p.handleSelectNodeResult(card.id, index)

  // 底部浮条渠道选择器: 与生成条同源, 按家族媒体类型过滤图片/视频渠道
  const params = card.genParams ?? defaultGenParams()
  const barIsVideo = channelFamilyOf(params.model)?.media === 'video'
  const modelOptions = p.modelOptions.filter(o => o.media === (barIsVideo ? 'video' : 'image'))
  // 结果主区可用宽度: 节点框内边距两侧各 8px, 主区须减去否则生成中/失败框与大图横向溢出框外
  const areaW = Math.max(card.w - 16, 160)
  // 完整生成条是否正展开(editNodeId 记录当前展开的节点): 展开时按钮变为「收起」
  const panelOpen = p.editNodeId === card.id

  // 浮条常显: 挂载/换渠道/换参数时主动询价(收起态下生成条未挂载, 价格要由浮条自己拉)
  useEffect(() => {
    p.refreshModelPrice(params.model, p.effectiveRefUrls(card), params)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.model, params.resolution, params.videoDuration, params.quality, params.aspectRatio, card.id])

  return (
    <div className="flex min-h-0 w-full flex-col">
      {/* 主结果区 */}
      <div className="group relative w-fit">
        {activeReady && !isVideo && (
          <div className="relative w-fit overflow-visible rounded-lg">
            <img
              src={mediaSrc(active?.url) ?? ''}
              alt={card.prompt || '生成结果'}
              draggable={false}
              onError={() => {
                // 仅当真裂图时按需从任务历史救回永久地址, 不在打开画布时批量改写健康数据
                if (active?.taskId) p.healResultImageByTask(card.id, activeIdx, active.taskId)
              }}
              onDoubleClick={e => {
                e.stopPropagation()
                p.handlePreviewCard(card.id)
              }}
              // w-auto 按自然宽显示, 再用确定像素上限收进卡片内宽:
              // 不能用 w-full——父级是 w-fit(宽度由内容定), 百分比宽度会循环引用导致图片按原像素撑破卡片。
              // 编辑/标签/删除入口统一收在卡片上方操作坞, 图片上不再覆盖按钮
              className="block h-auto w-auto rounded-lg object-contain"
              style={{ maxWidth: `${areaW}px` }}
            />
          </div>
        )}
        {activeReady && isVideo && active?.url && (
          // 标签/帧捕捉/导出入口统一收在卡片上方操作坞
          <div className="relative w-fit overflow-visible rounded-lg bg-muted/30" style={{ width: Math.min(areaW, 360) }}>
            <video src={mediaSrc(active.url)} controls preload="metadata" className="max-h-80 w-full rounded-lg object-contain" />
          </div>
        )}
        {activeBusy && (
          <div className="flex flex-col" style={{ width: Math.min(areaW, 320), minHeight: 180 }}>
            <ResultPendingState item={active} />
          </div>
        )}
        {activeFailed && (
          <div className="flex flex-col" style={{ width: Math.min(areaW, 320), minHeight: 140 }}>
            <ResultFailedState
              item={active}
              inflight={p.isRunInflight(`retry:${card.id}:${activeIdx}`)}
              onRetry={() => retryItem(activeIdx)}
            />
          </div>
        )}
      </div>

      {/* 缩略图条: 多张时可切换主看, 失败项可单独重试 */}
      {results.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {results.map((item, i) => (
            <ResultThumb
              key={i}
              item={item}
              index={i}
              active={i === activeIdx}
              inflight={p.isRunInflight(`retry:${card.id}:${i}`)}
              onSelect={() => selectItem(i)}
              onRetry={() => retryItem(i)}
            />
          ))}
        </div>
      )}

      {/* 底部浮条: 左侧渠道选择器(点击换模型) + 右侧 展开/重新生成/价格 */}
      <div
        className="mt-2 flex items-center justify-between gap-1 rounded-md border border-border/60 bg-card px-1.5 py-1 shadow-sm"
        onPointerDown={e => e.stopPropagation()}
        onDoubleClick={e => e.stopPropagation()}
      >
        <Select value={params.model} onValueChange={v => p.handleUpdateGenParams(card.id, { model: v })}>
          <SelectTrigger
            className="h-7 w-auto min-w-24 max-w-44 shrink-0 border-0 bg-transparent px-1.5 text-xs font-normal text-muted-foreground shadow-none [&>svg]:h-3 [&>svg]:w-3"
            title="点击切换模型渠道"
          >
            <span className="truncate">{shortModelLabel(params.model)}</span>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {modelOptions.map(o => (
              <SelectItem key={o.slug} value={o.slug}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {results.length > 1 && <span className="shrink-0 text-[11px] text-muted-foreground/70">{activeIdx + 1}/{results.length}</span>}
        <span className="ml-auto flex shrink-0 items-center">
          <ResultActionButton
            title={panelOpen ? '收起完整生成节点' : '展开: 恢复完整生成节点(提示词/参数/渠道设置)'}
            onClick={() => p.handleExpandNodePanel(card.id)}
          >
            {panelOpen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </ResultActionButton>
          <ResultActionButton
            title="重新生成"
            disabled={activeBusy || p.isRunInflight(`retry:${card.id}:${activeIdx}`)}
            onClick={() => retryItem(activeIdx)}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${activeBusy || p.isRunInflight(`retry:${card.id}:${activeIdx}`) ? 'animate-spin' : ''}`} />
          </ResultActionButton>
          {/* 价格跟随当前所选渠道实时计算(换模型/参数即刷新), 不用上次生成的扣费旧值 */}
          <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5">
            <ModelPriceText p={p} model={params.model} count={1} params={params} hasImg={p.effectiveRefUrls(card).length > 0} />
          </span>
        </span>
      </div>
    </div>
  )
}
