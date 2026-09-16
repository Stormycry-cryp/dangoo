import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, MapPin, Plus, Settings } from 'lucide-react'
import { useCanvasVm } from '@/components/canvas/canvasRuntime'
import { useTagsVersion } from './useGlobalTags'
import { PRESET_COLORS } from './tagModel'

const POPUP_W = 240

/**
 * 卡片标签入口(取代旧颜色图钉): 点击弹出深色浮层, 选标签打标/取消打标,
 * 顶部「+ 新建标签」与齿轮(打开标签管理弹窗)。
 * 浮层用 Portal 挂到 body 并按按钮屏幕坐标定位: 卡片在画布缩放层内、且多选时
 * 后渲染的同级卡有更高层叠, 困在卡片层叠上下文里的 absolute 浮层会被相邻卡整个盖住
 * (表现为点图钉「没反应」); Portal 后浮层恒在最顶, 且不随画布缩放变形。
 */
export function TagMenuButton({ cardId, variant = 'panel' }: { cardId: string; variant?: 'panel' | 'bare' | 'dock' }) {
  const p = useCanvasVm()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  // 订阅全局标签版本号: 标签增删改后浮层列表即时刷新
  const tagsVersion = useTagsVersion()

  // 浮层开启期间持续按按钮屏幕坐标定位(画布平移/缩放/滚动时跟随), 关闭时停止 rAF
  useLayoutEffect(() => {
    if (!open) return
    let raf = 0
    const update = () => {
      const el = rootRef.current
      if (el) {
        const r = el.getBoundingClientRect()
        setPos({
          // 右边缘与按钮对齐, 但不越过屏幕左边 8px
          left: Math.max(8, Math.round(r.right - POPUP_W)),
          top: Math.round(r.bottom + 6),
        })
      }
      raf = requestAnimationFrame(update)
    }
    update()
    return () => cancelAnimationFrame(raf)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const tags = p.tags
  const card = p.cards.find(c => c.id === cardId)
  const currentSlug = card ? p.resolveCardTagSlug(card) : null
  void tagsVersion

  const toggle = () => setOpen(v => !v)

  const button =
    variant === 'dock' ? (
      <button
        title="标签"
        aria-label="标签"
        onClick={e => {
          e.stopPropagation()
          toggle()
        }}
        onPointerDown={e => e.stopPropagation()}
        onDoubleClick={e => e.stopPropagation()}
        className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-primary/10 ${currentSlug ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
      >
        <MapPin className="h-4 w-4" />
      </button>
    ) : variant === 'bare' ? (
      <button
        title="标签"
        aria-label="标签"
        onClick={e => {
          e.stopPropagation()
          toggle()
        }}
        onPointerDown={e => e.stopPropagation()}
        onDoubleClick={e => e.stopPropagation()}
        className={`rounded p-1 transition-colors hover:bg-muted ${currentSlug ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <MapPin className="h-3.5 w-3.5" />
      </button>
    ) : (
      <button
        title="标签"
        aria-label="标签"
        onClick={e => {
          e.stopPropagation()
          toggle()
        }}
        onPointerDown={e => e.stopPropagation()}
        onDoubleClick={e => e.stopPropagation()}
        className={`flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card/85 shadow-sm backdrop-blur transition-colors hover:border-primary ${
          currentSlug ? 'text-primary' : 'text-muted-foreground hover:text-primary'
        }`}
      >
        <MapPin className="h-4 w-4" />
      </button>
    )

  return (
    <div ref={rootRef} className="relative">
      {button}
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-[80] w-60 overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-lg"
            style={{ left: pos.left, top: pos.top }}
            onPointerDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-1 border-b border-border/70 px-1 pb-1.5">
              <button
                type="button"
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-card-foreground transition-colors hover:bg-muted"
                onClick={e => {
                  e.stopPropagation()
                  setOpen(false)
                  p.openTagManager({ color: PRESET_COLORS[0], cardId })
                }}
              >
                <Plus className="h-3.5 w-3.5 text-primary" />
                新建标签
              </button>
              <button
                type="button"
                title="管理标签"
                aria-label="管理标签"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={e => {
                  e.stopPropagation()
                  setOpen(false)
                  p.openTagManager()
                }}
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-1 max-h-64 overflow-y-auto">
              {tags.length === 0 && (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">还没有标签, 点上方新建</p>
              )}
              {tags.map(tag => {
                const active = tag.slug === currentSlug
                return (
                  <button
                    key={tag.slug}
                    type="button"
                    title={active ? '再次点击取消标签' : tag.name}
                    onClick={e => {
                      e.stopPropagation()
                      p.setCardTag(cardId, active ? undefined : tag.slug)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                      active ? 'bg-muted/70 font-medium text-card-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-card-foreground'
                    }`}
                  >
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                    <span className="flex-1 truncate">{tag.name}</span>
                    {active && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                )
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
