import { Camera, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cameraSummaryFromConfig, DEFAULT_CAMERA_CONFIG } from '@/pages/Canvas/cameraModel'
import type { CanvasCardData } from '@/pages/Canvas/useCanvas'
import type { useCanvas } from '@/pages/Canvas/useCanvas'

type CanvasVm = ReturnType<typeof useCanvas>

/**
 * 摄影机节点卡面(精简版): 只展示机身 / 镜头 / 焦段+光圈 / 明度+特效摘要与「配置」按钮。
 * 摄影风格提示词不在卡面展示——绑定到生成节点后自动追加在最终请求提示词末尾,
 * 配置弹窗里仍有实时预览。不连线、不运行, 卡内交互必须阻止冒泡到画布手势。
 */
export function CameraNodeBody({ p, card }: { p: CanvasVm; card: CanvasCardData }) {
  const config = card.cameraState ?? DEFAULT_CAMERA_CONFIG
  const summary = cameraSummaryFromConfig(config)

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2 p-3"
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-card-foreground">
          <Camera className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{card.title || '摄影机'}</span>
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 border-primary/50 px-2 text-xs text-primary"
          onClick={() => p.openCameraConfig(card.id)}
        >
          <Settings2 className="mr-1 h-3.5 w-3.5" />
          配置
        </Button>
      </div>

      <div className="shrink-0 space-y-1 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
        <p className="truncate text-xs font-medium text-card-foreground" title={summary.title}>
          {summary.title}
        </p>
        <p className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">{summary.sub}</span>
          <span className="shrink-0 rounded-full bg-background/70 px-1.5 py-0.5 font-medium text-primary">{summary.meta}</span>
        </p>
        <p className="text-[10px] text-muted-foreground/80">{summary.metaTail}</p>
      </div>
    </div>
  )
}
