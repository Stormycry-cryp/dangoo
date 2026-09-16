import { Download, Layers, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LodThumb } from '@/components/canvas/NodeBarShared'
import { VISION_LLM_OPTIONS } from '@/pages/Canvas/useCanvas'
import type { CanvasCardData, LayerItem } from '@/pages/Canvas/useCanvas'
import type { useCanvas } from '@/pages/Canvas/useCanvas'
import { mediaSrc } from '@/lib/media'

type CanvasVm = ReturnType<typeof useCanvas>

function LayerStatusChip({ layer }: { layer: LayerItem }) {
  if (layer.genStatus === 'queued' || layer.genStatus === 'running') {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {layer.genStatus === 'queued' ? '排队中' : '生成中'}
      </span>
    )
  }
  if (layer.genStatus === 'success') {
    return (
      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
        {layer.cutoutUrl ? '已抠图' : '已生成'}
      </span>
    )
  }
  if (layer.genStatus === 'failed') {
    return <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">失败</span>
  }
  return <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">待生成</span>
}

export function LayerNodeBody({ p, card }: { p: CanvasVm; card: CanvasCardData }) {
  const ls = card.layerState
  if (!ls) return null
  const source = p.effectiveLayerSource(card.id)
  const enabledCount = ls.layers.filter(l => l.enabled).length
  const analyzing = ls.stage === 'analyzing'
  const generating = ls.stage === 'generating'
  const i2iOptions = p.modelOptions.filter(o => o.media === 'image')

  return (
    <div
      className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2"
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/30 p-2 text-center transition-colors hover:border-primary">
          {source ? (
            <LodThumb url={source} alt="原图" className="max-h-16 rounded object-contain" />
          ) : (
            <Upload className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground">
            {ls.sourceUrl ? '更换原图' : source ? '上游原图 · 上传可覆盖' : '上传原图 / 接上游图'}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              void p.handleLayerUpload(card.id, 'source', e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
        </label>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/30 p-2 text-center transition-colors hover:border-primary">
          {ls.markerUrl ? (
            <img src={mediaSrc(ls.markerUrl)} alt="标识示意图" className="max-h-16 rounded object-contain" />
          ) : (
            <Upload className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground">{ls.markerUrl ? '更换示意图' : '示意图(可选)'}</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              void p.handleLayerUpload(card.id, 'marker', e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      <div className="space-y-1.5">
        <Select value={ls.visionModel} onValueChange={v => p.updateCard(card.id, { layerState: { ...ls, visionModel: v } })}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VISION_LLM_OPTIONS.map(o => (
              <SelectItem key={o.slug} value={o.slug}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ls.genModel} onValueChange={v => p.updateCard(card.id, { layerState: { ...ls, genModel: v } })}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {i2iOptions.map(o => (
              <SelectItem key={o.slug} value={o.slug}>
                {o.label} · {o.priceText}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7 flex-1 px-2 text-xs text-foreground"
          disabled={!source || analyzing || generating}
          onClick={() => p.handleAnalyzeLayers(card.id)}
        >
          {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
          {analyzing ? '分析中…' : '分析图层'}
        </Button>
        {ls.layers.length > 0 && (
          <Button
            size="sm"
            className="h-7 flex-1 bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90"
            disabled={generating || enabledCount === 0 || p.isRunInflight(`layers:${card.id}`)}
            onClick={() => p.handleGenerateLayers(card.id)}
          >
            {(generating || p.isRunInflight(`layers:${card.id}`)) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {generating ? '生成中…' : `按图层生成(${enabledCount})`}
          </Button>
        )}
      </div>

      {ls.layers.length === 0 && !analyzing && (
        <p className="rounded-lg bg-muted/50 p-2 text-xs leading-relaxed text-muted-foreground">
          上传原图或连接上游图片后点「分析图层」: 识别可独立拆分的图层, 在清单里改名 / 停用 / 删除, 再逐图层生成并导出透明 PNG。中途刷新不丢进度。
        </p>
      )}

      {ls.layers.length > 0 && (
        <div className="space-y-1.5">
          {ls.layers.map(layer => (
            <div key={layer.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-card p-1.5 shadow-sm">
              <input
                type="checkbox"
                checked={layer.enabled}
                onChange={() => p.handleToggleLayer(card.id, layer.id)}
                className="h-3.5 w-3.5 shrink-0 accent-primary"
                title="启用 / 停用"
              />
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted/40">
                {layer.cutoutUrl || layer.genUrl ? (
                  // 图层清单 40px 小图走 96px LOD 缩略图, 多图层大画布不直连原图浪费解码内存
                  <LodThumb url={layer.cutoutUrl ?? layer.genUrl ?? ''} alt={layer.name} className="h-full w-full object-cover" />
                ) : (
                  <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <input
                  value={layer.name}
                  onChange={e => p.handleRenameLayer(card.id, layer.id, e.target.value)}
                  className="w-full rounded bg-transparent px-1 text-xs font-medium text-card-foreground outline-none focus:bg-muted"
                />
                <p className="truncate px-1 text-xs text-muted-foreground" title={layer.desc}>
                  {layer.errorMsg ?? (layer.desc || '—')}
                </p>
              </div>
              <LayerStatusChip layer={layer} />
              {layer.genStatus === 'failed' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={p.isRunInflight(`layer-retry:${card.id}:${layer.id}`)}
                  className="h-6 shrink-0 px-1.5 text-xs text-foreground"
                  onClick={() => p.handleRetryLayer(card.id, layer.id)}
                >
                  {p.isRunInflight(`layer-retry:${card.id}:${layer.id}`)
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <RefreshCw className="h-3 w-3" />}
                </Button>
              )}
              {layer.genStatus === 'success' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 shrink-0 px-1.5 text-xs text-foreground"
                  onClick={() => p.handleDownloadLayer(layer)}
                >
                  <Download className="h-3 w-3" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 shrink-0 p-0 text-muted-foreground"
                title="删除图层"
                onClick={() => p.handleDeleteLayer(card.id, layer.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between pt-0.5">
            <p className="text-xs text-muted-foreground">生成后自动抠图, 导出即透明 PNG</p>
            <Button variant="secondary" size="sm" className="h-6 px-2 text-xs" onClick={() => p.handleDownloadAllLayers(card.id)}>
              <Download className="h-3 w-3" />
              导出全部
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
