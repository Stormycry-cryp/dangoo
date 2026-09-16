import { AudioLines, Film, PersonStanding, Wand2, type LucideIcon } from 'lucide-react'
import type { AssetLibEntry } from './assetLib'

// 内置预设封面: 纯 token 视觉(深色底 + 主色光斑 + 专属图形符号), 不依赖外部图片。
// 卡片实际只有约 96px 见方, 故采用海报式定位: 装饰与图标收在顶部图标带,
// 名称(两行)+价格固定压在底部, 绝不能被挤出裁切区。
// 后续若要换成手绘封面图, 在预设定义里给 coverUrl 即可, 卡片会优先显示图片。

type MotifKind = 'film' | 'audio' | 'motion' | 'vsr'

interface PresetVisual {
  icon: LucideIcon
  motif: MotifKind
}

const PRESET_VISUAL: Record<string, PresetVisual> = {
  'preset-wan22-i2v': { icon: Film, motif: 'film' },
  'preset-indextts2': { icon: AudioLines, motif: 'audio' },
  'preset-animatev9': { icon: PersonStanding, motif: 'motion' },
  'preset-videovsr': { icon: Wand2, motif: 'vsr' },
}

/** 装饰统一收在「图标牌下沿 ~ 标题带上沿」之间约 6px 的装饰带, 绝不压名称与价格 */

/** 胶片孔: 左右两列小孔, 只排在卡片上半段 */
function FilmMotif() {
  return (
    <>
      {['left-1.5', 'right-1.5'].map(side => (
        <div key={side} className={`pointer-events-none absolute ${side} top-2 flex h-9 flex-col justify-between`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-primary/20" />
          ))}
        </div>
      ))}
    </>
  )
}

/** 声波柱: 图标牌下方三小柱 */
function AudioMotif() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-9 flex h-1.5 items-end justify-center gap-1">
      {['h-1', 'h-1.5', 'h-1'].map((h, i) => (
        <span key={i} className={`w-0.5 rounded-full bg-primary/35 ${h}`} />
      ))}
    </div>
  )
}

/** 动作轨迹: 图标牌下方三颗渐隐圆点 */
function MotionMotif() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-9 flex h-1.5 items-center justify-center gap-1.5">
      <span className="h-1 w-1 rounded-full bg-primary/25" />
      <span className="h-1.5 w-1.5 rounded-full bg-primary/45" />
      <span className="h-1 w-1 rounded-full bg-primary/25" />
    </div>
  )
}

/** 扫描修复: 图标牌下方一条渐隐扫描线 */
function VsrMotif() {
  return (
    <div className="pointer-events-none absolute inset-x-6 top-9 h-px translate-y-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
  )
}

function Motif({ kind }: { kind: MotifKind }) {
  if (kind === 'film') return <FilmMotif />
  if (kind === 'audio') return <AudioMotif />
  if (kind === 'motion') return <MotionMotif />
  return <VsrMotif />
}

/**
 * 预设工作流封面主体: 铺满父容器的正方形封面。
 * 上层卡片负责圆角/边框/拖放; 悬停浮层预览也复用本组件。
 */
export function PresetCoverArt({ entry }: { entry: AssetLibEntry }) {
  const visual = PRESET_VISUAL[entry.key]
  if (!visual) return null
  const Icon = visual.icon

  return (
    <div className="group relative h-full w-full overflow-hidden bg-card">
      {/* 主色光斑: 左上亮、右下收, 同色系深浅分层 */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5" />
      <div className="pointer-events-none absolute -right-5 -top-5 h-16 w-16 rounded-full bg-primary/10 blur-lg" />
      <Motif kind={visual.motif} />

      {/* 顶部图标带: 图标牌固定在上方, hover 轻微放大 */}
      <div className="absolute inset-x-0 top-2 z-10 flex justify-center">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 shadow-md transition-transform duration-300 group-hover:scale-105">
          <Icon className="h-4 w-4 text-primary" />
        </span>
      </div>

      {/* 底部标题带: 名称两行完整显示 + 价格胶囊, 区域固定不被裁切 */}
      <div className="absolute inset-x-1.5 bottom-1 z-10 flex flex-col items-center gap-0.5">
        <p className="line-clamp-2 min-h-0 text-center text-[11px] font-semibold leading-tight text-card-foreground">
          {entry.displayName}
        </p>
        {entry.priceText && (
          <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold leading-relaxed text-primary-foreground shadow-sm">
            {entry.priceText}
          </span>
        )}
      </div>
    </div>
  )
}
