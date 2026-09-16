import { Blend, Bot, Camera, Layers, LayoutTemplate, Repeat, Sparkles } from 'lucide-react'
import type { useCanvas } from '@/pages/Canvas/useCanvas'

type CanvasVm = ReturnType<typeof useCanvas>

// 润色节点已与 Agent 功能重叠下线; 语音克隆/动作迁移/视频高清修复仅保留给工作流资产复用,
// 不再从双击菜单新建(已有画布里的这些节点仍可正常显示与运行)。
const MENU_ITEMS = [
  { key: 'generate', title: '生成节点', desc: '可选传图, 写描述出图或出视频', icon: Sparkles },
  { key: 'merge', title: '图像融合', desc: '把局部修改图羽化融合回原图', icon: Blend },
  { key: 'agent', title: 'Agent', desc: '手写或用 LLM 生成文本 / 表格', icon: Bot },
  { key: 'loop', title: '循环节点', desc: '批量执行上游 Agent 的任务', icon: Repeat },
  { key: 'layer', title: '图片分层', desc: '原图拆图层, 导出透明 PNG', icon: Layers },
  { key: 'replicate', title: '图片复刻', desc: '分析参考图生成正反面设计', icon: LayoutTemplate },
  { key: 'camera', title: '摄影机', desc: '机身、镜头、明度和镜头特效', icon: Camera },
] as const

export function CanvasAddMenu({ p }: { p: CanvasVm }) {
  if (!p.addMenuPos) return null
  const pos = p.addMenuPos

  const pick = (key: (typeof MENU_ITEMS)[number]['key']) => {
    if (key === 'generate') p.handleAddGenerateCardAt(pos)
    else if (key === 'merge') p.handleAddMergeCardAt(pos)
    else if (key === 'layer') p.handleAddLayerNodeAt(pos)
    else if (key === 'agent') p.handleAddAgentCardAt(pos)
    else if (key === 'loop') p.handleAddLoopCardAt(pos)
    else if (key === 'camera') p.handleAddCameraCardAt(pos)
    else p.handleAddReplicateNodeAt(pos)
  }

  return (
    <div
      className="absolute z-40"
      style={{ left: pos.x, top: pos.y, transform: `scale(${1 / p.viewport.scale})`, transformOrigin: '0 0' }}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      <div className="w-[440px] rounded-2xl border border-border bg-card p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="grid grid-cols-2 gap-2">
          {MENU_ITEMS.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                onClick={() => pick(item.key)}
                className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/50 p-3 text-left transition-colors hover:border-primary hover:bg-secondary"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted">
                  <Icon className="h-4 w-4 text-foreground" />
                </span>
                <span className="text-sm font-semibold text-card-foreground">{item.title}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">{item.desc}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 px-1 text-xs text-muted-foreground">点击菜单外任意位置或按 Esc 关闭</p>
      </div>
    </div>
  )
}
