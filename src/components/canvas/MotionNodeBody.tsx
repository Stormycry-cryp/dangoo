import { useRef, useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown, Clapperboard, Download, Loader2, Play, RefreshCw, Settings2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  MOTION_CHEST_MAX,
  MOTION_CHEST_MIN,
  MOTION_EXPRESSION_MAX,
  MOTION_EXPRESSION_MIN,
  MOTION_POSE_INTENSITY_MAX,
  MOTION_POSE_INTENSITY_MIN,
  MOTION_POSE_MODES,
  MOTION_PRICE_TEXT,
  MOTION_RESOLUTIONS,
  MOTION_CAMERA_INTENSITY_MAX,
  MOTION_CAMERA_INTENSITY_MIN,
  MOTION_STEP,
  motionCameraIntensityOf,
  motionChestOf,
  motionExpressionOf,
  motionIntOf,
  motionPoseIntensityOf,
} from '@/pages/Canvas/canvasModels'
import type { CanvasCardData, MotionNodeState } from '@/pages/Canvas/canvasTypes'
import type { useCanvas } from '@/pages/Canvas/useCanvas'
import { mediaSrc } from '@/lib/media'

type CanvasVm = ReturnType<typeof useCanvas>
type MotionSlotKey = 'image' | 'video'

/** 媒体上传槽: 图片/视频共用同一交互形态, 空态虚线占位, 已上传显示预览 + 文件名 + 移除 */
function MediaSlot({
  p,
  cardId,
  slot,
  label,
  hint,
  accept,
  url,
  name,
  required,
}: {
  p: CanvasVm
  cardId: string
  slot: MotionSlotKey
  label: string
  hint: string
  accept: string
  url?: string
  name?: string
  required?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const isVideo = slot === 'video'

  const pickFile = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      await p.handleMotionUpload(cardId, slot, file)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-card-foreground">
          {label}
          {required && <span className="ml-0.5 text-primary">*</span>}
        </span>
        {url && (
          <button
            type="button"
            title="移除媒体"
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            onPointerDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              p.handleRemoveMotionMedia(cardId, slot)
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {url ? (
        <div className="space-y-1.5">
          {isVideo ? (
            <video
              src={mediaSrc(url)}
              controls
              preload="metadata"
              className="max-h-44 w-full rounded-md bg-black"
              onPointerDown={e => e.stopPropagation()}
              onDoubleClick={e => e.stopPropagation()}
            />
          ) : (
            <div className="overflow-hidden rounded-md border border-border bg-background">
              <img
                src={mediaSrc(url)}
                alt={name ?? '参考图'}
                className="max-h-44 w-full object-contain"
                draggable={false}
                onPointerDown={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
              />
            </div>
          )}
          <p className="truncate text-[11px] text-muted-foreground" title={name ?? ''}>
            {name || (isVideo ? '已上传视频' : '已上传图片')}
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
          className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-card py-4 text-center transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-card"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <Upload className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-[11px] text-muted-foreground">
            {uploading ? '上传中…' : isVideo ? '点击选择动作视频' : '点击选择人物图片'}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
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

/** 滑杆 + 数值输入双输入, 与语音克隆节点同款 */
function SliderNumberRow({
  label,
  hint,
  suggest,
  value,
  min,
  max,
  clamp,
  onChange,
}: {
  label: string
  hint: string
  suggest?: string
  value: number
  min: number
  max: number
  clamp: (v: number | string | null | undefined) => number
  onChange: (v: number) => void
}) {
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
          step={MOTION_STEP}
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
        step={MOTION_STEP}
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

/** 整数数字输入(跳过前帧 / 帧上限 / 帧率), 失焦或回车时钳制 */
function IntegerRow({
  label,
  value,
  min,
  max,
  fallback,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  fallback: number
  onChange: (v: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation()
  const commit = () => {
    if (draft !== null) {
      onChange(motionIntOf(draft, min, max, fallback))
      setDraft(null)
    }
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-card-foreground">{label}</span>
      <Input
        type="number"
        value={draft ?? String(value)}
        min={min}
        max={max}
        step={1}
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
  )
}

/** 开关行 */
function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onPointerDown={stop}
      onDoubleClick={stop}
      onClick={e => {
        e.stopPropagation()
        if (!disabled) onChange(!checked)
      }}
      className={`flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-2 py-1.5 text-left transition-colors ${
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-primary/60'
      }`}
    >
      <span className="text-xs font-semibold text-card-foreground">
        {label}
        {hint && <span className="ml-1 block font-normal text-[10px] leading-tight text-muted-foreground/80">{hint}</span>}
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  )
}

export function MotionNodeBody({ p, card }: { p: CanvasVm; card: CanvasCardData }) {
  const ms: MotionNodeState | undefined = card.motionState
  const [advancedOpen, setAdvancedOpen] = useState(false)
  if (!ms) return null
  const running = ms.jobStatus === 'queued' || ms.jobStatus === 'running'
  const failed = ms.jobStatus === 'failed'
  const succeeded = ms.jobStatus === 'success' && !!ms.resultUrl
  const wuWuPose = ms.poseMode === '3'

  const patch = (partial: Partial<MotionNodeState>) => p.updateMotionState(card.id, partial)

  return (
    <div
      className="space-y-2.5 p-2.5"
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      <MediaSlot
        p={p}
        cardId={card.id}
        slot="image"
        label="人物参考图"
        hint="一张清晰的人物照片, 正脸/半身效果最好"
        accept="image/*"
        url={ms.refImageUrl}
        name={ms.refImageName}
        required
      />

      <MediaSlot
        p={p}
        cardId={card.id}
        slot="video"
        label="动作参考视频"
        hint="MP4 / WEBM / MOV / GIF, 建议 50 秒内; 1080P 建议 10 秒内"
        accept="video/*"
        url={ms.refVideoUrl}
        name={ms.refVideoName}
        required
      />

      <div className="space-y-1">
        <span className="block text-xs font-semibold text-card-foreground">清晰度</span>
        <Select value={ms.resolution} onValueChange={v => patch({ resolution: v })}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="选择清晰度" />
          </SelectTrigger>
          <SelectContent>
            {MOTION_RESOLUTIONS.map(item => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Collapsible.Root open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <Collapsible.Trigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-xs font-semibold text-card-foreground transition-colors hover:border-primary/60 hover:bg-primary/5"
          >
            <span className="flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5 text-primary" />
              高级参数
            </span>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className="space-y-2.5 pt-2">
          <div className="space-y-1">
            <span className="block text-xs font-semibold text-card-foreground">姿势选择</span>
            <Select
              value={ms.poseMode}
              onValueChange={v => patch({ poseMode: v, longNeck: v === '3' ? ms.longNeck : false })}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="选择姿势模式" />
              </SelectTrigger>
              <SelectContent>
                {MOTION_POSE_MODES.map(item => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ToggleRow
            label="脖子长修正"
            hint="仅 WUWUPOSE 且人物脖子偏长时开启"
            checked={ms.longNeck}
            disabled={!wuWuPose}
            onChange={v => patch({ longNeck: v })}
          />

          <div className="space-y-2.5 rounded-lg border border-border bg-muted/30 p-2">
            <SliderNumberRow
              label="姿势强度"
              hint="0-2"
              suggest="数值越高动作跟随越强, 默认 1.0"
              value={motionPoseIntensityOf(ms.poseIntensity)}
              min={MOTION_POSE_INTENSITY_MIN}
              max={MOTION_POSE_INTENSITY_MAX}
              clamp={motionPoseIntensityOf}
              onChange={v => patch({ poseIntensity: v })}
            />
            <SliderNumberRow
              label="表情强度"
              hint="0-2"
              suggest="动物 / 动漫角色建议调低, 默认 0.8"
              value={motionExpressionOf(ms.expression)}
              min={MOTION_EXPRESSION_MIN}
              max={MOTION_EXPRESSION_MAX}
              clamp={motionExpressionOf}
              onChange={v => patch({ expression: v })}
            />
            <SliderNumberRow
              label="胸部抖动幅度"
              hint="0-1"
              suggest="默认 0.2, 不需要可调到 0"
              value={motionChestOf(ms.chest)}
              min={MOTION_CHEST_MIN}
              max={MOTION_CHEST_MAX}
              clamp={motionChestOf}
              onChange={v => patch({ chest: v })}
            />
          </div>

          <ToggleRow
            label="运镜"
            hint="开启后画面带镜头运动"
            checked={ms.cameraOn}
            onChange={v => patch({ cameraOn: v })}
          />
          {ms.cameraOn && (
            <div className="rounded-lg border border-border bg-muted/30 p-2">
              <SliderNumberRow
                label="运镜强度"
                hint="0-2"
                value={motionCameraIntensityOf(ms.cameraIntensity)}
                min={MOTION_CAMERA_INTENSITY_MIN}
                max={MOTION_CAMERA_INTENSITY_MAX}
                clamp={motionCameraIntensityOf}
                onChange={v => patch({ cameraIntensity: v })}
              />
            </div>
          )}

          <ToggleRow
            label="面具头盔模式"
            hint="钢铁侠 / 奥特曼等头盔角色才需要"
            checked={ms.maskHelmet}
            onChange={v => patch({ maskHelmet: v })}
          />

          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-2">
            <IntegerRow
              label="跳过前帧"
              value={ms.skipFrames}
              min={0}
              max={500}
              fallback={0}
              onChange={v => patch({ skipFrames: v })}
            />
            <IntegerRow
              label="加载帧上限"
              value={ms.frameLimit}
              min={1}
              max={2000}
              fallback={840}
              onChange={v => patch({ frameLimit: v })}
            />
            <IntegerRow
              label="帧率（24 或 30）"
              value={ms.frameRate}
              min={1}
              max={60}
              fallback={30}
              onChange={v => patch({ frameRate: v })}
            />
          </div>
        </Collapsible.Content>
      </Collapsible.Root>

      {failed && (
        <div className="space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/10 p-2">
          <p className="text-[11px] leading-relaxed text-destructive">{ms.errorMsg || '生成失败, 请重试'}</p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full text-xs text-foreground"
            disabled={running}
            onClick={() => p.handleRunMotion(card.id)}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            单独重试
          </Button>
        </div>
      )}

      {succeeded && ms.resultUrl && (
        <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-primary">
              <Clapperboard className="h-3.5 w-3.5" />
              生成的视频
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs text-foreground"
              onPointerDown={e => e.stopPropagation()}
              onDoubleClick={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation()
                p.handleDownloadMotion(card.id)
              }}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              下载
            </Button>
          </div>
          <video
            src={mediaSrc(ms.resultUrl)}
            controls
            preload="metadata"
            className="max-h-56 w-full rounded-md bg-black"
            onPointerDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
        <span className="text-xs font-semibold text-primary">{MOTION_PRICE_TEXT}</span>
        <Button
          size="sm"
          className="h-8 bg-primary px-4 text-xs text-primary-foreground hover:bg-primary/90"
          disabled={running}
          onClick={() => p.handleRunMotion(card.id)}
        >
          {running ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-1 h-3.5 w-3.5" />
          )}
          {running ? (ms.jobStatus === 'queued' ? '提交中…' : '生成中…') : '运行'}
        </Button>
      </div>
    </div>
  )
}
