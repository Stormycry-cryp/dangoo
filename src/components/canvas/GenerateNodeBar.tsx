import { useEffect } from 'react'
import { ArrowUp, Camera, Loader2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { MiniSelect, ModelPriceText, RefThumbRow, shortModelLabel, LodThumb, ratioLabel, withAdaptiveRatio } from '@/components/canvas/NodeBarShared'
import { T2I_MODELS, T2V_MODELS, aiAppSlugOf, channelFamilyOf, defaultGenParams, resolveRunModel, supportsTransparentBg } from '@/pages/Canvas/useCanvas'
import {
  AI_APP_LONG_EDGE_MAX,
  AI_APP_LONG_EDGE_MIN,
  AI_APP_LONG_EDGE_STEP,
  AI_APP_FRAMES_MAX,
  AI_APP_FRAMES_MIN,
  AI_APP_FRAMES_STEP,
  aiAppLongEdgeOf,
  aiAppFramesOf,
} from '@/pages/Canvas/canvasModels'
import type { CanvasCardData } from '@/pages/Canvas/useCanvas'
import type { useCanvas } from '@/pages/Canvas/useCanvas'

type CanvasVm = ReturnType<typeof useCanvas>

const MODE_TABS: Array<{ category: 'image' | 'video'; label: string; first: string }> = [
  { category: 'image', label: '图片', first: T2I_MODELS[0] },
  { category: 'video', label: '视频', first: T2V_MODELS[0] },
]

/** AI 应用渠道参数步进器: 标签 + 数值 + 加减档 */
function AiAppStepper({
  label,
  value,
  min,
  max,
  step,
  title,
  onStep,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  title: string
  onStep: (next: number) => void
}) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-border/60 bg-background/40 px-1" title={title}>
      <button
        type="button"
        disabled={value <= min}
        onClick={() => onStep(Math.max(min, value - step))}
        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-primary disabled:opacity-30"
      >
        −
      </button>
      <span className="w-20 text-center text-xs text-foreground">
        {label} {value}
      </span>
      <button
        type="button"
        disabled={value >= max}
        onClick={() => onStep(Math.min(max, value + step))}
        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-primary disabled:opacity-30"
      >
        +
      </button>
    </div>
  )
}

/** 生成节点生成条(选中态): 缩略图行+页签 / 大提示词 / 底行渠道+参数+数量+价格+圆形运行 */
export function BatchGenerateNodeBar({ p }: { p: CanvasVm }) {
  const targets = p.cards.filter(c => p.selectedIds.includes(c.id) && c.kind === 'generate')
  const first = targets[0]
  const params = first?.genParams ?? defaultGenParams()
  const hasImg = first ? p.effectiveRefUrls(first).length > 0 : false
  // 页签归属用家族媒体类型; 控件契约按有无参考图解析出的真实模型取
  const isVideo = channelFamilyOf(params.model)?.media === 'video'
  const runModel = resolveRunModel(params.model, hasImg)
  const info = first ? p.getNodeModelInfo(runModel) : null
  useEffect(() => {
    if (first) p.requestModelInfo(runModel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runModel, first?.id])
  const scalarOpts = (name: string) => info?.scalar_params?.find(sp => sp.name === name)?.enum ?? []
  const modelOptions = p.modelOptions.filter(o => o.media === (isVideo ? 'video' : 'image'))
  const resOpts = scalarOpts('resolution')
  const arOpts = withAdaptiveRatio(scalarOpts('aspectRatio'))
  const qOpts = scalarOpts('quality')
  const ratioOpts = scalarOpts('ratio')
  const durOpts = info?.scalar_params?.find(sp => sp.name === 'duration')?.enum ?? []
  const durLabel = (v: string) => (v === '-1' ? '自动时长' : `${v} 秒`)
  if (!first || targets.length < 2) return null
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap border-b border-border bg-card p-2" onPointerDown={e => e.stopPropagation()}>
      <span className="mr-1 shrink-0 text-xs font-medium text-muted-foreground">批量设置 · {targets.length} 个生成节点</span>
      <div className="flex shrink-0 items-center gap-0.5 rounded-md bg-muted/70 p-0.5">
        {MODE_TABS.map(tab => (
          <button
            key={tab.category}
            type="button"
            onClick={() => p.handleUpdateSelectedGenParams({ model: tab.first })}
            className={`rounded px-2 py-1 text-xs ${tab.category === (isVideo ? 'video' : 'image') ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <Select value={params.model} onValueChange={v => p.handleUpdateSelectedGenParams({ model: v })}>
        <SelectTrigger className="h-8 w-44 shrink-0 text-xs"><span className="truncate">{shortModelLabel(params.model)}</span></SelectTrigger>
        <SelectContent>{modelOptions.map(o => <SelectItem key={o.slug} value={o.slug}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      {resOpts.length > 0 && <MiniSelect value={params.resolution ?? resOpts[0]} options={resOpts} onChange={v => p.handleUpdateSelectedGenParams({ resolution: v })} width="w-16" />}
      {!isVideo && arOpts.length > 0 && <MiniSelect value={params.aspectRatio ?? '16:9'} options={arOpts} onChange={v => p.handleUpdateSelectedGenParams({ aspectRatio: v })} format={ratioLabel} width="w-20" />}
      {isVideo && ratioOpts.length > 0 && <MiniSelect value={params.videoRatio ?? 'adaptive'} options={ratioOpts} onChange={v => p.handleUpdateSelectedGenParams({ videoRatio: v })} width="w-20" />}
      {!isVideo && qOpts.length > 0 && <MiniSelect value={params.quality ?? 'medium'} options={qOpts} onChange={v => p.handleUpdateSelectedGenParams({ quality: v })} width="w-20" />}
      {isVideo && durOpts.length > 0 && <MiniSelect value={params.videoDuration ?? '5'} options={durOpts} onChange={v => p.handleUpdateSelectedGenParams({ videoDuration: v })} format={durLabel} width="w-20" />}
      {!isVideo && supportsTransparentBg(runModel) && (
        <MiniSelect
          value={params.transparentBg ? 'on' : 'off'}
          options={['off', 'on']}
          onChange={v => p.handleUpdateSelectedGenParams({ transparentBg: v === 'on' })}
          format={v => `透明背景 · ${v === 'on' ? '开启' : '关闭'}`}
          width="w-32"
        />
      )}
      {p.runningCount > 0 && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          {p.runningCount} 个任务进行中
        </span>
      )}
      <Button
        size="sm"
        disabled={!p.batchSettingsReady || p.runningCount > 0 || p.batchRunInflight()}
        className="h-8 shrink-0"
        onClick={p.handleRunSelectedNodes}
      >
        {(p.runningCount > 0 || p.batchRunInflight()) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {p.batchSettingsReady ? '批量运行' : '先完成批量设置'}
      </Button>
    </div>
  )
}

export function GenerateNodeBar({ p, card }: { p: CanvasVm; card: CanvasCardData }) {
  const params = card.genParams ?? defaultGenParams()
  const effRefs = p.effectiveRefUrls(card)
  const hasImg = effRefs.length > 0
  // 页签归属用家族媒体类型; 控件契约/询价按有无参考图解析出的真实模型取
  const isVideo = channelFamilyOf(params.model)?.media === 'video'
  const runModel = resolveRunModel(params.model, hasImg)
  const info = p.getNodeModelInfo(runModel)

  useEffect(() => {
    p.requestModelInfo(runModel)
    // 询价跟家族主键(与结果浮条同口径): 同家族文生/图生单价一致, 按解析后的真实模型询价
    // 会因图生分支复合键缺失让底行回退固定起价, 切分辨率/渠道看起来像价格不刷新
    p.refreshModelPrice(params.model, effRefs, params)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runModel, params.model, params.resolution, params.videoDuration, params.quality, params.aspectRatio])

  const scalarOpts = (paramName: string) => info?.scalar_params?.find(sp => sp.name === paramName)?.enum ?? []
  const scalarParam = (paramName: string) => info?.scalar_params?.find(sp => sp.name === paramName)
  const resOpts = scalarOpts('resolution')
  const arOpts = withAdaptiveRatio(scalarOpts('aspectRatio'))
  const qOpts = scalarOpts('quality')
  const ratioOpts = scalarOpts('ratio')
  const durParam = scalarParam('duration')
  const durOpts = durParam?.enum ?? []
  const durLabel = (v: string) => (v === '-1' ? '自动时长' : `${v} 秒`)

  // AI 应用渠道单次只出 1 个视频, 不展示数量选择, 也没有标准模型契约参数
  const isAiApp = !!aiAppSlugOf(runModel)
  const count = isAiApp ? 1 : Math.max(1, Math.min(4, params.count || 1))
  const upstream = p.upstreamImageUrls(card.id)
  // 渠道下拉: 同模型文生/图生合并为一条, 全部渠道平铺
  const groupOptions = p.modelOptions.filter(o => o.media === (isVideo ? 'video' : 'image'))
  // 运行中(任一结果项排队/生成, 或同步重入锁已占): 圆形钮禁用并转圈, 杜绝双击重复扣费
  const nodeRunBusy =
    card.jobStatus === 'queued' ||
    card.jobStatus === 'running' ||
    (card.results ?? []).some(r => r.itemStatus === 'queued' || r.itemStatus === 'running') ||
    p.isRunInflight(`node:${card.id}`)

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 bg-muted/30 p-3"
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      <div className="flex shrink-0 flex-col gap-2">
        <div className="flex items-center gap-1.5">
          {upstream.length > 0 && (
            <span className="shrink-0 text-xs text-muted-foreground">上游参考</span>
          )}
          {upstream.slice(0, 9).map(u => (
            <LodThumb
              key={u}
              url={u}
              alt="上游参考图"
              title="来自上游连线节点, 参与本节点生成"
              className="h-8 w-8 shrink-0 rounded-md border border-border object-cover"
            />
          ))}
          <RefThumbRow p={p} card={card} />
          {effRefs.length > 9 && (
            <span className="shrink-0 text-xs text-destructive">超过 9 张参考可能会参考不上</span>
          )}
          <span className="ml-auto" />
          <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/70 p-0.5">
            {MODE_TABS.map(t => (
              <button
                key={t.category}
                onClick={() => p.handleUpdateGenParams(card.id, { model: t.first })}
                className={`whitespace-nowrap rounded-md px-2 py-1 text-xs transition-colors ${
                  (t.category === 'video') === isVideo
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            title={hasImg ? '读取参考图反推并优化提示词, 回填到输入框' : '优化提示词并回填到输入框'}
            className="h-8 shrink-0 border-primary/50 px-2 text-primary"
            disabled={p.polishingGenId === card.id}
            onClick={() => void p.handleInlinePolishGenerate(card.id)}
          >
            {p.polishingGenId === card.id
              ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              : <Wand2 className="mr-1 h-3.5 w-3.5" />}
            {p.polishingGenId === card.id ? (hasImg ? '反推中' : '润色中') : '润色'}
          </Button>
          <CameraBindingSelect p={p} card={card} />
        </div>
      </div>

      <textarea
        value={card.prompt ?? ''}
        placeholder="描述想生成的画面… 输入 @ 从素材库选参考图"
        onChange={e => {
          const prev = card.prompt ?? ''
          const next = e.target.value
          p.updateCard(card.id, { prompt: next })
          if (next.length === prev.length + 1 && next.endsWith('@')) p.handleOpenAssetPicker(card.id)
        }}
        onPointerDown={e => e.stopPropagation()}
        onDoubleClick={e => e.stopPropagation()}
        className="my-1 min-h-32 flex-1 resize-none rounded-md border border-border bg-background/60 p-3 font-sans text-xs leading-relaxed text-card-foreground outline-none placeholder:text-muted-foreground/70 focus:ring-1 focus:ring-primary"
      />

      <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
        <Select value={params.model} onValueChange={v => p.handleUpdateGenParams(card.id, { model: v })}>
          <SelectTrigger className="h-8 w-48 shrink-0 border-border/60 bg-background/40 text-xs shadow-none">
            <span className="truncate">{shortModelLabel(params.model)}</span>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {groupOptions.map(o => (
              <SelectItem key={o.slug} value={o.slug}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isVideo && arOpts.length > 0 && (
          <MiniSelect
            value={params.aspectRatio ?? '1:1'}
            options={arOpts}
            onChange={v => p.handleUpdateGenParams(card.id, { aspectRatio: v })}
            format={ratioLabel}
            width="w-20"
          />
        )}
        {isVideo && ratioOpts.length > 0 && (
          <MiniSelect
            value={params.videoRatio ?? 'adaptive'}
            options={ratioOpts}
            onChange={v => p.handleUpdateGenParams(card.id, { videoRatio: v })}
            width="w-20"
          />
        )}
        {isVideo && arOpts.length > 0 && ratioOpts.length === 0 && (
          <MiniSelect
            value={params.videoRatio ?? 'adaptive'}
            options={arOpts}
            onChange={v => p.handleUpdateGenParams(card.id, { videoRatio: v })}
            format={ratioLabel}
            width="w-20"
          />
        )}
        {resOpts.length > 0 && (
          <MiniSelect
            value={params.resolution ?? '1k'}
            options={resOpts}
            onChange={v => p.handleUpdateGenParams(card.id, { resolution: v })}
            width="w-16"
          />
        )}
        {isVideo && durOpts.length > 0 && (
          <MiniSelect
            value={params.videoDuration ?? '5'}
            options={durOpts}
            onChange={v => p.handleUpdateGenParams(card.id, { videoDuration: v })}
            format={durLabel}
            width="w-20"
          />
        )}
        {isVideo && durParam && durOpts.length === 0 && durParam.type === 'number' && (
          <input
            type="number"
            min={1}
            max={15}
            value={params.videoDuration ?? '5'}
            onChange={e => p.handleUpdateGenParams(card.id, { videoDuration: e.target.value })}
            title="视频时长(秒)"
            className="h-8 w-16 rounded-md border border-border/60 bg-background/40 px-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
          />
        )}
        {!isVideo && qOpts.length > 0 && (
          <MiniSelect
            value={params.quality ?? 'medium'}
            options={qOpts}
            onChange={v => p.handleUpdateGenParams(card.id, { quality: v })}
            width="w-20"
          />
        )}
        {!isVideo && supportsTransparentBg(runModel) && (
          <MiniSelect
            value={params.transparentBg ? 'on' : 'off'}
            options={['off', 'on']}
            onChange={v => p.handleUpdateGenParams(card.id, { transparentBg: v === 'on' })}
            format={v => `透明背景 · ${v === 'on' ? '开启' : '关闭'}`}
            width="w-32"
          />
        )}
        {isAiApp && aiAppSlugOf(runModel) === 'wan22hq' && (
          <>
            <AiAppStepper
              label="最长分辨率"
              value={aiAppLongEdgeOf(params.aiAppLongEdge)}
              min={AI_APP_LONG_EDGE_MIN}
              max={AI_APP_LONG_EDGE_MAX}
              step={AI_APP_LONG_EDGE_STEP}
              title="生成视频的最长边(像素)"
              onStep={next => p.handleUpdateGenParams(card.id, { aiAppLongEdge: next })}
            />
            <AiAppStepper
              label="总帧数"
              value={aiAppFramesOf(params.aiAppFrames)}
              min={AI_APP_FRAMES_MIN}
              max={AI_APP_FRAMES_MAX}
              step={AI_APP_FRAMES_STEP}
              title="总帧数, 81 帧约 6 秒; 帧数越多视频越长"
              onStep={next => p.handleUpdateGenParams(card.id, { aiAppFrames: next })}
            />
          </>
        )}
        {isAiApp && aiAppSlugOf(runModel) !== 'wan22hq' && (
          <AiAppStepper
            label="最长边"
            value={aiAppLongEdgeOf(params.aiAppLongEdge)}
            min={AI_APP_LONG_EDGE_MIN}
            max={AI_APP_LONG_EDGE_MAX}
            step={AI_APP_LONG_EDGE_STEP}
            title="生成视频的最长边(像素)"
            onStep={next => p.handleUpdateGenParams(card.id, { aiAppLongEdge: next })}
          />
        )}
        <span className="ml-auto" />
        {!isAiApp && (
          <MiniSelect
            value={String(count)}
            options={['1', '2', '3', '4']}
            onChange={v => p.handleUpdateGenParams(card.id, { count: Number(v) })}
            format={v => `${v}x`}
            width="w-14"
          />
        )}
        {!info && !isAiApp && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />}
        <ModelPriceText p={p} model={params.model} count={count} params={params} hasImg={effRefs.length > 0} />
        <Button
          size="sm"
          title="运行"
          disabled={nodeRunBusy}
          className="h-8 w-8 shrink-0 rounded-full bg-primary p-0 text-primary-foreground shadow-md hover:bg-primary/90"
          onClick={() => p.handleRunGenerateNode(card.id)}
        >
          {nodeRunBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

/**
 * 生成节点设置面板第一行的摄影机绑定控件:
 * 「无摄影机」+ 当前画布全部摄影机; 绑定的摄影机被删后显示「<名>·已删除用快照」占位项。
 */
function CameraBindingSelect({ p, card }: { p: CanvasVm; card: CanvasCardData }) {
  const NONE = '__none__'
  const SNAPSHOT = '__snapshot__'
  // Radix Select 的 item 值不允许空字符串, 无摄影机用哨兵值, onChange 时转回 ''
  const options = p.cameraBindingOptions(card).map(o => ({ value: o.value === '' ? NONE : o.value, label: o.label }))
  const boundValue = card.cameraNodeId
  const rawValue = boundValue ?? (card.cameraSnapshot ? SNAPSHOT : NONE)
  const value = options.some(o => o.value === rawValue) ? rawValue : NONE
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Camera className="h-3.5 w-3.5 text-muted-foreground" />
      <MiniSelect
        value={value}
        options={options.map(o => o.value)}
        onChange={v => {
          if (v === NONE) p.handleSetGenCamera(card.id, '')
          else if (v !== SNAPSHOT) p.handleSetGenCamera(card.id, v)
        }}
        format={v => options.find(o => o.value === v)?.label ?? '无摄影机'}
        width="w-44"
      />
    </span>
  )
}
