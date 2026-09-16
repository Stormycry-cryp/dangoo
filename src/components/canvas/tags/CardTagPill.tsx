import { X } from 'lucide-react'
import { useCanvasVm } from '@/components/canvas/canvasRuntime'
import { useTagsVersion, getTagDefNow } from './useGlobalTags'
import { readableTextOn } from './tagModel'
import type { CanvasCardData } from '@/pages/Canvas/useCanvas'

/**
 * 卡片外上方悬浮的标签胶囊(不与卡片接触: 与卡片顶边留 6px 间隙, 与卡片右缘对齐):
 * 实心标签色 + 按底色亮度自适应黑/白文字 + 右侧 × 取消本卡标签。
 * 容器整体 pointer-events-none(不拦拖卡), 仅 × 按钮可点; 无标签(含旧 pinColor 无映射)时不渲染。
 * 根容器 overflow-visible, absolute 元素不进布局流, 不会撑大卡片尺寸或被圆角裁切。
 */
export function CardTagPill({ card }: { card: CanvasCardData }) {
  const p = useCanvasVm()
  // 订阅标签版本号: 标签定义增删改(尤其删除)后胶囊即时出现/消失
  useTagsVersion()
  const slug = p.resolveCardTagSlug(card)
  const def = slug ? getTagDefNow(slug) : null
  if (!def) return null
  const textColor = readableTextOn(def.color)
  return (
    <div
      className="pointer-events-none absolute right-0 z-30 flex items-center"
      style={{ bottom: 'calc(100% + 6px)' }}
    >
      <span
        className="flex items-center gap-1 whitespace-nowrap rounded-full py-0.5 pl-2 pr-1 text-xs font-medium shadow-md"
        style={{ backgroundColor: def.color, color: textColor }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: textColor, opacity: 0.75 }} />
        {def.name}
        <button
          type="button"
          title="取消标签"
          aria-label="取消标签"
          className="pointer-events-auto flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-black/20"
          onClick={e => {
            e.stopPropagation()
            p.setCardTag(card.id, undefined)
          }}
          onPointerDown={e => e.stopPropagation()}
          onDoubleClick={e => e.stopPropagation()}
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    </div>
  )
}
