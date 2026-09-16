import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2,
  Copy,
  Film,
  Loader2,
  Pause,
  Play,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { mediaSrc } from '@/lib/media'
import type { GenLogEntry, GenLogOutput } from '@/pages/Canvas/canvasTypes'
import { copyTextToClipboard, formatLogTime, formatRunMs } from './generationLogUtils'

interface GenerationLogCardProps {
  entry: GenLogEntry
  onPreview: (url: string, mediaType: 'image' | 'video') => void
}

/** 状态标识: 成功 primary / 失败 destructive / 运行中 muted+脉冲 */
function StatusBadge({ logStatus }: { logStatus: GenLogEntry['status'] }) {
  if (logStatus === 'success') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
        <CheckCircle2 className="h-3.5 w-3.5" />
        成功
      </span>
    )
  }
  if (logStatus === 'failed') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
        <XCircle className="h-3.5 w-3.5" />
        失败
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      运行中
    </span>
  )
}

/** 音频小方块: 点击直接播放/暂停(不打开图片预览) */
function AudioThumb({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  return (
    <>
      <button
        type="button"
        title="点击试听音频"
        onClick={() => {
          const el = audioRef.current
          if (!el) return
          if (playing) {
            el.pause()
          } else {
            void el.play().catch(() => toast.error('音频播放失败'))
          }
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
      </button>
      <audio
        ref={el => {
          audioRef.current = el
        }}
        src={mediaSrc(url)}
        preload="none"
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        className="hidden"
      />
    </>
  )
}

function Thumbnail({
  url,
  kind,
  label,
  onPreview,
}: {
  url: string
  kind: 'image' | 'video' | 'audio'
  label?: string
  onPreview: (url: string, mediaType: 'image' | 'video') => void
}) {
  if (kind === 'audio') return <AudioThumb url={url} />
  const isVideo = kind === 'video'
  return (
    <button
      type="button"
      onClick={() => onPreview(url, isVideo ? 'video' : 'image')}
      title={isVideo ? '点击播放视频' : '点击预览大图'}
      className="group relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border transition-all hover:scale-105 hover:border-primary hover:shadow-md"
    >
      {isVideo ? (
        <video src={mediaSrc(url)} muted preload="metadata" className="h-full w-full object-cover" />
      ) : (
        <img src={mediaSrc(url)} alt={label ?? '参考图'} loading="lazy" className="h-full w-full object-cover" />
      )}
      {isVideo && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
          <Film className="h-3.5 w-3.5 text-white" />
        </span>
      )}
    </button>
  )
}

function ThumbRow({
  label,
  urls,
  onPreview,
}: {
  label: string
  urls: GenLogOutput[]
  onPreview: (url: string, mediaType: 'image' | 'video') => void
}) {
  if (!urls.length) return null
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">
        {urls.map((u, i) => (
          <Thumbnail key={`${u.url}-${i}`} url={u.url} kind={u.kind} label={label} onPreview={onPreview} />
        ))}
      </div>
    </div>
  )
}

export function GenerationLogCard({ entry, onPreview }: GenerationLogCardProps) {
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current) }, [])
  const hasPrompt = !!entry.prompt?.trim()

  async function copyOnce(text: string, okText: string) {
    const ok = await copyTextToClipboard(text)
    if (ok) {
      toast.success(okText)
      setCopied(true)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), 1200)
    } else {
      toast.error('复制失败, 请手动选择文本复制')
    }
  }

  function handleCopyPrompt() {
    if (hasPrompt) void copyOnce(entry.prompt, '提示词已复制')
  }

  function handleCopyTaskId() {
    if (entry.taskId) void copyOnce(entry.taskId, '任务 ID 已复制')
  }

  return (
    <article
      className={cn(
        'rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/40',
        entry.status === 'failed' ? 'border-destructive/30' : 'border-border',
      )}
    >
      {/* 第一行: 状态 + 平台/节点/模型 + 时间/耗时/费用 */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge logStatus={entry.status} />
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">{entry.platform}</span>
        <span className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{entry.nodeType}</span>
        <span className="max-w-[320px] truncate text-xs font-medium text-foreground" title={entry.model}>
          {entry.model}
        </span>
        {/* 任务 ID 跟在运行标题后: 等宽小字截断, 悬停看全号, 点击复制; 不再展开请求参数详情 */}
        {entry.taskId && (
          <button
            type="button"
            onClick={handleCopyTaskId}
            title={`点击复制任务 ID：${entry.taskId}`}
            className="max-w-[140px] truncate rounded px-1 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            #{entry.taskId}
          </button>
        )}
        {entry.batchSummary && (
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">{entry.batchSummary}</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span>{formatLogTime(entry.createdAt)}</span>
          <span title="运行耗时">{formatRunMs(entry.runMs)}</span>
          {entry.costText && <span className="font-medium text-foreground">{entry.costText}</span>}
        </div>
      </div>

      {/* 提示词: 两行截断, 点击整条复制 */}
      {hasPrompt && (
        <button
          type="button"
          onClick={handleCopyPrompt}
          title="点击复制提示词"
          className="mt-2 flex w-full items-start gap-1.5 rounded-lg border border-dashed border-border px-2 py-1.5 text-left text-xs leading-relaxed text-foreground/90 transition-colors hover:border-primary hover:bg-muted/50"
        >
          <Copy className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', copied ? 'text-primary' : 'text-muted-foreground')} />
          <span className="line-clamp-2 break-all">{entry.prompt}</span>
        </button>
      )}

      {/* 输入素材(图/视频/音频按真实类型, 音频任务无此行) / 输出缩略图行, 统一 36px 小方块 */}
      <div className="mt-1.5 space-y-1">
        {entry.refsMedia ? (
          <ThumbRow label="输入素材" urls={entry.refsMedia} onPreview={onPreview} />
        ) : (
          <ThumbRow
            label="参考图"
            urls={entry.refs.map(u => ({ url: u, kind: 'image' as const }))}
            onPreview={onPreview}
          />
        )}
        <ThumbRow label="输出" urls={entry.outputs} onPreview={onPreview} />
      </div>

      {/* 失败错误 */}
      {entry.status === 'failed' && entry.error && (
        <p className="mt-2 line-clamp-2 break-all rounded-lg bg-destructive/5 px-2 py-1 text-xs text-destructive" title={entry.error}>
          {entry.error}
        </p>
      )}

    </article>
  )
}
