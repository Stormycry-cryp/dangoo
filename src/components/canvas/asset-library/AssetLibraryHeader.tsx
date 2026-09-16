import { Images, Loader2, Save, Workflow } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { useCanvas } from '@/pages/Canvas/useCanvas'

type CanvasVm = ReturnType<typeof useCanvas>
export type AssetLibraryTab = 'images' | 'workflows'

/**
 * 资产库面板头部 + 页签:
 * 标题 / 保存选中节点主按钮(primary, 含义随页签变化) / 收起钮;
 * 「图片资产」=存图片/视频/图片组, 「工作流」=存节点链路模板。
 */
export function AssetLibraryHeader({
  p,
  activeTab,
  onTabChange,
  onSaveSelected,
  saving,
}: {
  p: CanvasVm
  activeTab: AssetLibraryTab
  onTabChange: (tab: AssetLibraryTab) => void
  onSaveSelected: () => void
  saving: boolean
}) {
  const isWorkflowTab = activeTab === 'workflows'
  const saveEnabled = isWorkflowTab ? p.workflowSelectionState.ok : p.selectedHasMedia
  const saveTitle = isWorkflowTab
    ? p.workflowSelectionState.ok
      ? p.workflowSelectionState.reason
      : p.workflowSelectionState.reason
    : p.selectedHasMedia
      ? '把当前选中的带图节点存为资产'
      : '请先在画布上选择带图片的节点'
  const saveLabel = isWorkflowTab ? '保存选中节点为工作流' : '保存选中节点为资产'

  return (
    <div className="shrink-0 border-b border-border/70 px-3 pb-2 pt-3">
      <div className="flex items-center gap-2">
        <Images className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-card-foreground">资产库</h2>
        <div className="flex-1" />
        <button
          type="button"
          disabled={!saveEnabled || saving}
          onClick={onSaveSelected}
          title={saveTitle}
          className={cn(
            'flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-card',
            'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-sm',
          )}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saveLabel}
        </button>
      </div>

      <div className="mt-2.5 flex items-center gap-1 rounded-xl bg-muted/60 p-1">
        <button
          type="button"
          onClick={() => onTabChange('images')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all',
            activeTab === 'images'
              ? 'bg-card text-primary shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Images className="h-3.5 w-3.5" />
          图片资产
        </button>
        <button
          type="button"
          onClick={() => onTabChange('workflows')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all',
            activeTab === 'workflows'
              ? 'bg-card text-primary shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Workflow className="h-3.5 w-3.5" />
          工作流
        </button>
      </div>
    </div>
  )
}
