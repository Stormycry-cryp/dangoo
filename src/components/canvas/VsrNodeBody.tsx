import { useRef, useState } from 'react'
import { Clapperboard, Download, Loader2, Play, RefreshCw, Sparkles, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  VSR_MODELS,
  VSR_RESOLUTION_MAX,
  VSR_RESOLUTION_MIN,
  VSR_RESOLUTION_STEP,
  vsrPriceOf,
  vsrResolutionOf,
} from '@/pages/Canvas/canvasModels'
import type { CanvasCardData, VsrNodeState } from '@/pages/Canvas/canvasTypes'
import type { useCanvas } from '@/pages/Canvas/useCanvas'
import { mediaSrc } from '@/lib/media'

type CanvasVm = ReturnType<typeof useCanvas>

/** 待修复视频槽: 空态虚线占位, 已上传显示预览 + 文件名 + 移除 */
function VideoSlot({ p, cardId, url, name }: { p: CanvasVm; cardId: string; url?: string; name?: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const pickFile = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      await p.handleVsrUpload(cardId, file)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-card-foreground">
          待修复视频
          <span className="ml-0.5 text-primary">*</span>
        </span>
        {url && (
          <button
            type="button"
            title="移除视频"
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            onPointerDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              p.handleRemoveVsrVideo(cardId)
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {url ? (
        <div className="space-y-1.5">
          <video
            src={mediaSrc(url)}
            controls
            preload="metadata"
            className="max-h-44 w-full rounded-md bg-black"
            onPointerDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
          />
          <p className="truncate text-[11px] text-muted-foreground" title={name ?? ''}>
            {name || '已上传视频'}
          </p>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onPointerDown={e => e.stopPropagation()}
          onDoubleClick={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            inputRef.current?.click()
          }}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-card py-5 text-center transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-card"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <Upload className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-[11px] text-muted-foreground">{uploading ? '上传中…' : '点击选择要修复的视频'}</span>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={e => {
              void pickFile(e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
        </button>
      )}
      <p className="text-[10px] leading-relaxed text-muted-foreground/80">MP4 / WEBM / MOV, 不超过 100MB</p>
    </div>
  )
}

/** 整数分辨率: 滑杆 + 数字输入, 失焦或回车时钳制并对齐档位 */
function ResolutionRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation()
  const commit = () => {
    if (draft !== null) {
      onChange(vsrResolutionOf(draft))
      setDraft(null)
    }
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-card-foreground">
          最大分辨率
          <span className="ml-1 font-normal text-muted-foreground/80">(像素, 长边)</span>
        </span>
        <Input
          type="number"
          value={draft ?? String(value)}
          min={VSR_RESOLUTION_MIN}
          max={VSR_RESOLUTION_MAX}
          step={VSR_RESOLUTION_STEP}
          className="h-7 w-24 shrink-0 py-1 text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          onPointerDown={stop}
          onDoubleClick={stop}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              commit()
              e.currentTarget.blur()
            }
          }}
        />
      </div>
      <input
        type="range"
        min={VSR_RESOLUTION_MIN}
        max={VSR_RESOLUTION_MAX}
        step={VSR_RESOLUTION_STEP}
        value={value}
        onPointerDown={stop}
        onDoubleClick={stop}
        onChange={e => {
          setDraft(null)
          onChange(vsrResolutionOf(e.target.value))
        }}
        className="h-4 w-full cursor-pointer accent-primary"
        aria-label="最大分辨率"
      />
      <p className="text-[10px] leading-tight text-muted-foreground/80">不建议超过 1920, 数值越高耗时越长</p>
    </div>
  )
}

export function VsrNodeBody({ p, card }: { p: CanvasVm; card: CanvasCardData }) {
  const vs: VsrNodeState | undefined = card.vsrState
  if (!vs) return null
  const running = vs.jobStatus === 'queued' || vs.jobStatus === 'running'
  const failed = vs.jobStatus === 'failed'
  const succeeded = vs.jobStatus === 'success' && !!vs.resultUrl
  const current = VSR_MODELS.find(m => m.value === vs.model) ?? VSR_MODELS[0]
  const patch = (partial: Partial<VsrNodeState>) => p.updateVsrState(card.id, partial)

  return (
    <div
      className="space-y-2.5 p-2.5"
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      <VideoSlot p={p} cardId={card.id} url={vs.videoUrl} name={vs.videoName} />

      <div className="space-y-1">
        <span className="flex items-center gap-1 text-xs font-semibold text-card-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          修复模型
        </span>
        <Select value={vs.model} onValueChange={v => patch({ model: v === '2' ? '2' : '1' })}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="选择修复模型" />
          </SelectTrigger>
          <SelectContent>
            {VSR_MODELS.map(item => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {current.hint && <p className="text-[10px] leading-tight text-muted-foreground/80">{current.hint}</p>}
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-2">
        <ResolutionRow value={vsrResolutionOf(vs.maxResolution)} onChange={v => patch({ maxResolution: v })} />
      </div>

      {failed && (
        <div className="space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/10 p-2">
          <p className="text-[11px] leading-relaxed text-destructive">{vs.errorMsg || '修复失败, 请重试'}</p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full text-xs text-foreground"
            disabled={running}
            onClick={() => p.handleRunVsr(card.id)}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            单独重试
          </Button>
        </div>
      )}

      {succeeded && vs.resultUrl && (
        <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-primary">
              <Clapperboard className="h-3.5 w-3.5" />
              修复后的视频
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs text-foreground"
              onPointerDown={e => e.stopPropagation()}
              onDoubleClick={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation()
                p.handleDownloadVsr(card.id)
              }}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              下载
            </Button>
          </div>
          <video
            src={mediaSrc(vs.resultUrl)}
            controls
            preload="metadata"
            className="max-h-56 w-full rounded-md bg-black"
            onPointerDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
        <span className="text-xs font-semibold text-primary">¥{vsrPriceOf(vs.model).toFixed(2)} / 次</span>
        <Button
          size="sm"
          className="h-8 bg-primary px-4 text-xs text-primary-foreground hover:bg-primary/90"
          disabled={running}
          onClick={() => p.handleRunVsr(card.id)}
        >
          {running ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-1 h-3.5 w-3.5" />
          )}
          {running ? (vs.jobStatus === 'queued' ? '提交中…' : '修复中…') : '运行'}
        </Button>
      </div>
    </div>
  )
}
