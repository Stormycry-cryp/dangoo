import { useEffect, useRef, useState } from 'react'
import { Download, Loader2, Pause, Play } from 'lucide-react'
import { mediaSrc } from '@/lib/media'

/** 把秒数格式化成 m:ss */
function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * 深色自绘音频播放器: 替代浏览器原生 <audio controls>——
 * 原生条在深色画布上是白底, 且下载菜单(「下载该音频」)会溢出节点框。
 * onPointerDown/DoubleClick 全部阻断, 点播放器不会拖动画布。
 */
export function MiniAudioPlayer({
  src,
  onDownload,
  downloadTitle = '下载音频',
  className = '',
}: {
  src: string
  onDownload?: () => void
  downloadTitle?: string
  className?: string
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

  // 组件卸载/换源时停掉播放, 避免离开页面后还在响
  useEffect(() => {
    const el = audioRef.current
    return () => {
      el?.pause()
    }
  }, [src])

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
      return
    }
    setLoading(true)
    void el
      .play()
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }

  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = audioRef.current
    if (!el || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    el.currentTime = ratio * duration
    setCurrent(el.currentTime)
  }

  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0

  return (
    <div
      className={`flex h-8 items-center gap-1.5 rounded-md border border-border bg-background/70 px-1.5 ${className}`}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      <button
        type="button"
        title={playing ? '暂停' : '播放'}
        onClick={toggle}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : playing ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5 translate-x-px" />
        )}
      </button>
      <span className="w-9 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground">
        {formatTime(current)}
      </span>
      <div
        role="slider"
        aria-label="播放进度"
        title="点击调整进度"
        onPointerDown={e => {
          e.stopPropagation()
          seek(e)
        }}
        className="group relative h-3 flex-1 cursor-pointer"
      >
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="w-9 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground">{formatTime(duration)}</span>
      {onDownload && (
        <button
          type="button"
          title={downloadTitle}
          onClick={e => {
            e.stopPropagation()
            onDownload()
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      )}
      <audio
        ref={audioRef}
        src={mediaSrc(src)}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={e => setCurrent(e.currentTarget.currentTime)}
        className="hidden"
      />
    </div>
  )
}
