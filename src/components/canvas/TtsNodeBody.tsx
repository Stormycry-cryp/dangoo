import { useRef, useState } from 'react'
import { AudioLines, Download, Loader2, Play, RefreshCw, Upload, X } from 'lucide-react'
import { MiniAudioPlayer } from '@/components/canvas/MiniAudioPlayer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  TTS_EMOTION_MODES,
  TTS_INTENSITY_MAX,
  TTS_INTENSITY_MIN,
  TTS_INTENSITY_STEP,
  TTS_PRICE_TEXT,
  TTS_RATE_MAX,
  TTS_RATE_MIN,
  TTS_RATE_STEP,
  ttsIntensityOf,
  ttsRateOf,
} from '@/pages/Canvas/canvasModels'
import type { CanvasCardData, TtsNodeState } from '@/pages/Canvas/canvasTypes'
import type { useCanvas } from '@/pages/Canvas/useCanvas'

type CanvasVm = ReturnType<typeof useCanvas>
type AudioSlotKey = 'clone' | 'emotion'

/** 音频上传槽: 空态虚线占位点击上传, 已上传显示文件名 + 播放器 + 移除钮 */
function AudioSlot({
  p,
  cardId,
  slot,
  label,
  hint,
  url,
  name,
  disabled,
  required,
}: {
  p: CanvasVm
  cardId: string
  slot: AudioSlotKey
  label: string
  hint: string
  url?: string
  name?: string
  disabled?: boolean
  required?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const dimmed = !!disabled

  const pickFile = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      await p.handleTtsUpload(cardId, slot, file)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={`space-y-1 rounded-lg border border-border bg-muted/30 p-2 ${dimmed ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-card-foreground">
          {label}
          {required && <span className="ml-0.5 text-primary">*</span>}
        </span>
        {url && !disabled && (
          <button
            type="button"
            title="移除音频"
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            onPointerDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              p.handleRemoveTtsAudio(cardId, slot)
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {url ? (
        <div className="space-y-1.5">
          <p className="truncate text-[11px] text-muted-foreground" title={name ?? ''}>
            {name || '已上传音频'}
          </p>
          <MiniAudioPlayer src={url} />
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onPointerDown={e => e.stopPropagation()}
          onDoubleClick={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            inputRef.current?.click()
          }}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-card py-3 text-center transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-card"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <Upload className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-[11px] text-muted-foreground">{uploading ? '上传中…' : '点击选择音频文件'}</span>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={e => {
              void pickFile(e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
        </button>
      )}
      <p className="text-[10px] leading-relaxed text-muted-foreground/80">{hint}</p>
    </div>
  )
}

/** 滑杆 + 数值输入双输入: 一行标签+数字框, 下一行滑杆, 比胶囊档位省空间 */
function SliderNumberRow({
  label,
  hint,
  suggest,
  value,
  min,
  max,
  step,
  clamp,
  onChange,
}: {
  label: string
  hint: string
  suggest?: string
  value: number
  min: number
  max: number
  step: number
  clamp: (v: number | string | null | undefined) => number
  onChange: (v: number) => void
}) {
  // 数字框正在输入时用本地草稿, 避免输入 "0." 这种中间态被实时钳制打断
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value.toFixed(2)
  const commit = () => {
    if (draft !== null) {
      onChange(clamp(draft))
      setDraft(null)
    }
  }
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation()

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-card-foreground">
          {label}
          <span className="ml-1 font-normal text-muted-foreground/80">({hint})</span>
        </span>
        <Input
          type="number"
          value={shown}
          min={min}
          max={max}
          step={step}
          // 加宽 + 隐藏原生上下箭头, 保证两位小数完整可见不被截断
          className="h-7 w-20 shrink-0 py-1 text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={stop}
        onDoubleClick={stop}
        onChange={e => {
          setDraft(null)
          onChange(clamp(e.target.value))
        }}
        className="h-4 w-full cursor-pointer accent-primary"
        aria-label={label}
      />
      {suggest && <p className="text-[10px] leading-tight text-muted-foreground/80">{suggest}</p>}
    </div>
  )
}

export function TtsNodeBody({ p, card }: { p: CanvasVm; card: CanvasCardData }) {
  const ts: TtsNodeState | undefined = card.ttsState
  if (!ts) return null
  const running = ts.jobStatus === 'queued' || ts.jobStatus === 'running'
  const failed = ts.jobStatus === 'failed'
  const succeeded = ts.jobStatus === 'success' && !!ts.resultUrl
  const customEmotion = ts.emotionMode === '8'

  const patch = (partial: Partial<TtsNodeState>) => p.updateTtsState(card.id, partial)

  return (
    <div
      className="space-y-2.5 p-2.5"
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      <AudioSlot
        p={p}
        cardId={card.id}
        slot="clone"
        label="要克隆的声音"
        hint="≤ 20 秒干净人声, 背景无杂音效果最好"
        url={ts.cloneAudioUrl}
        name={ts.cloneAudioName}
        required
      />

      <AudioSlot
        p={p}
        cardId={card.id}
        slot="emotion"
        label="情绪参考音频"
        hint={customEmotion ? '约 15 秒, 用这段音频的情绪来朗读' : '仅「自定义情绪」模式需要, 当前模式不必上传'}
        url={customEmotion ? ts.emotionRefAudioUrl : undefined}
        name={ts.emotionRefAudioName}
        disabled={!customEmotion}
      />

      <div className="space-y-1">
        <span className="block text-xs font-semibold text-card-foreground">情绪模式</span>
        <Select value={ts.emotionMode} onValueChange={v => patch({ emotionMode: v })}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="选择情绪模式" />
          </SelectTrigger>
          <SelectContent>
            {TTS_EMOTION_MODES.map(mode => (
              <SelectItem key={mode.value} value={mode.value}>
                {mode.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2.5 rounded-lg border border-border bg-muted/30 p-2">
        <SliderNumberRow
          label="情绪强度调节"
          hint="0.0-1.6"
          suggest="0 = 不参考情绪, 数值越高情绪越强, 音色也会随之变化"
          value={ttsIntensityOf(ts.emotionIntensity)}
          min={TTS_INTENSITY_MIN}
          max={TTS_INTENSITY_MAX}
          step={TTS_INTENSITY_STEP}
          clamp={ttsIntensityOf}
          onChange={v => patch({ emotionIntensity: v })}
        />
        <SliderNumberRow
          label="语速调节"
          hint="每次 0.5, 非必要不动"
          suggest="往左偏慢、往右偏快, 建议 0.9 – 1.1, 范围 0.5 – 2"
          value={ttsRateOf(ts.speechRate)}
          min={TTS_RATE_MIN}
          max={TTS_RATE_MAX}
          step={TTS_RATE_STEP}
          clamp={ttsRateOf}
          onChange={v => patch({ speechRate: v })}
        />
      </div>

      <div className="space-y-1">
        <span className="block text-xs font-semibold text-card-foreground">朗读文本</span>
        <Textarea
          value={ts.text}
          rows={4}
          placeholder="输入想让克隆声音说的文本，建议分段生成"
          onChange={e => patch({ text: e.target.value })}
          className="resize-y py-1.5 text-xs leading-relaxed"
        />
      </div>

      {failed && (
        <div className="space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/10 p-2">
          <p className="text-[11px] leading-relaxed text-destructive">{ts.errorMsg || '生成失败, 请重试'}</p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full text-xs text-foreground"
            disabled={running}
            onClick={() => p.handleRunTts(card.id)}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            单独重试
          </Button>
        </div>
      )}

      {succeeded && ts.resultUrl && (
        <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-primary">
              <AudioLines className="h-3.5 w-3.5" />
              生成的语音
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs text-foreground"
              onPointerDown={e => e.stopPropagation()}
              onDoubleClick={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation()
                p.handleDownloadTts(card.id)
              }}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              下载
            </Button>
          </div>
          <MiniAudioPlayer src={ts.resultUrl} />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
        <span className="text-xs font-semibold text-primary">{TTS_PRICE_TEXT}</span>
        <Button
          size="sm"
          className="h-8 bg-primary px-4 text-xs text-primary-foreground hover:bg-primary/90"
          disabled={running}
          onClick={() => p.handleRunTts(card.id)}
        >
          {running ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-1 h-3.5 w-3.5" />
          )}
          {running ? (ts.jobStatus === 'queued' ? '提交中…' : '生成中…') : '运行'}
        </Button>
      </div>
    </div>
  )
}
