import { ImagePlus } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { useLod } from '@/components/canvas/useLod'
import { MODEL_LABELS } from '@/pages/Canvas/useCanvas'
import type { CanvasCardData } from '@/pages/Canvas/useCanvas'
import type { useCanvas } from '@/pages/Canvas/useCanvas'

type CanvasVm = ReturnType<typeof useCanvas>

/** 参考图小图: 只显示 96px 缩略图(与画布共享缓存), 缩略图未就绪时回退原图; 参与生成的始终是原图地址 */
export function LodThumb({
  url,
  alt,
  title,
  className,
}: {
  url: string
  alt: string
  title?: string
  className: string
}) {
  const lod = useLod(url, 0)
  return <img src={lod.src ?? url} alt={alt} title={title} className={className} draggable={false} />
}

/** 模型展示名: 带渠道后缀(官方稳定/低价渠道), 同名模型的分辨率/价格差异要靠后缀区分 */
export function shortModelLabel(slug: string): string {
  return MODEL_LABELS[slug] ?? slug
}

/** 比例选项对齐官网: 枚举已含 adaptive/empty 时原样用, 否则补「自适应」在首位(提交时省略比例参数=平台自定) */
export function withAdaptiveRatio(options: string[]): string[] {
  if (options.length === 0 || options.includes('adaptive') || options.includes('empty')) return options
  return ['adaptive', ...options]
}

/** 比例展示文案: 官网把 empty/adaptive 统一叫「自适应」 */
export function ratioLabel(v: string): string {
  return v === 'empty' || v === 'adaptive' ? '自适应' : v
}

/** 紧凑参数小控件 */
export function MiniSelect({
  value,
  options,
  onChange,
  format,
  width,
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
  format?: (v: string) => string
  width: string
}) {
  const display = options.includes(value) ? value : options[0] ?? value
  return (
    <Select value={display} onValueChange={onChange}>
      <SelectTrigger className={`h-8 ${width} border-border/60 bg-background/40 text-xs shadow-none`}>
        <span className="truncate">{format ? format(display) : display}</span>
      </SelectTrigger>
      <SelectContent>
        {options.map(opt => (
          <SelectItem key={opt} value={opt}>
            {format ? format(opt) : opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** 参考图缩略图行: 生成节点的节点图作第一张, 其余参考图逐张移除, 支持上传/素材库添加 */
export function RefThumbRow({
  p,
  card,
  showAssetButton = true,
}: {
  p: CanvasVm
  card: CanvasCardData
  showAssetButton?: boolean
}) {
  const refs = card.refUrls ?? []
  const isGen = card.kind === 'generate'
  // 主图若是本节点自己生成的结果, 不再作为「图片位参考图」显示/提交(防止结果自引用);
  // 与 effectiveRefUrls 同口径, 只有上传到图片位的参考图才在这里出现。
  const ownResult = isGen && card.url
    ? (card.results ?? []).some(r => r && r.itemStatus === 'success' && r.url === card.url)
    : false
  const showNodeImage = isGen && !!card.url && !ownResult
  const total = refs.length + (showNodeImage ? 1 : 0)
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-1.5"
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      {showNodeImage && card.url && (
        <span className="group relative">
          <LodThumb url={card.url} alt="节点图" className="h-11 w-11 rounded-md border border-border object-cover" />
          <button
            title="移除图片"
            onClick={() => p.handleClearNodeImage(card.id)}
            className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-xs leading-none text-destructive-foreground group-hover:flex"
          >
            ×
          </button>
        </span>
      )}
      {refs.map(url => (
        <span key={url} className="group relative">
          <LodThumb url={url} alt="参考图" className="h-11 w-11 rounded-md border border-border object-cover" />
          <button
            title="移除参考图"
            onClick={() => p.handleRemoveRefFromCard(card.id, url)}
            className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-xs leading-none text-destructive-foreground group-hover:flex"
          >
            ×
          </button>
        </span>
      ))}
      {showAssetButton && (
        <button
          title="从素材库选参考图(也可在输入框打 @)"
          onClick={() => p.handleOpenAssetPicker(card.id)}
          className="flex h-11 w-11 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <ImagePlus className="h-4 w-4" />
        </button>
      )}
      {total > 0 && <span className="text-xs text-muted-foreground">{total} 张图</span>}
    </div>
  )
}

/** 底行价格文案: 固定单价 × 数量算预估, 按时长/实际扣费照实展示; 视频按 分辨率|时长 组合价 */
export function ModelPriceText({
  p,
  model,
  count,
  params,
  hasImg = false,
}: {
  p: CanvasVm
  model: string
  count: number
  params?: import('@/pages/Canvas/useCanvas').GenNodeParams
  hasImg?: boolean
}) {
  const text = p.priceTextForModel(model, count, params, hasImg)
  return (
    <span className="shrink-0 text-xs font-medium text-primary" title="所选渠道价格">
      {text}
    </span>
  )
}
