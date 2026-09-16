import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { useCanvas } from '@/pages/Canvas/useCanvas'
import { useAssetLibraryPanel } from './useAssetLibraryPanel'
import { AssetLibraryHeader } from './AssetLibraryHeader'
import { FolderBar } from './FolderBar'
import { AssetGrid } from './AssetGrid'

type CanvasVm = ReturnType<typeof useCanvas>

/**
 * 右侧资产库浮动面板: 悬浮在画布右上方, 不挤压画布;
 * 收起用 opacity/visibility/pointer-events 过渡, 收起时不拦截画布手势。
 */
export function AssetLibraryPanel({ p }: { p: CanvasVm }) {
  const ui = useAssetLibraryPanel(p)
  const [saving, setSaving] = useState(false)

  async function handleSaveSelected() {
    if (saving) return
    setSaving(true)
    try {
      const folderId = ui.folderId === 'uncategorized' ? '' : ui.folderId
      if (ui.activeTab === 'workflows') {
        await p.handleSaveSelectedToWorkflow(ui.scope, folderId)
      } else {
        await p.handleSaveSelectedToLibrary(ui.scope, folderId)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      aria-hidden={!p.assetPanelOpen}
      onPointerDown={() => {
        if (p.selectedIds.length) p.clearSelection()
      }}
      className={cn(
        // 关闭态不渲染 children(见下方条件): 旧实现仅 opacity 隐藏, 面板里多少个视频素材就有多少个
        // <video> 与 metadata 请求常驻整个会话; 关闭即卸载后静止期媒体元素归零。
        'fixed bottom-24 right-[22px] top-[68px] z-40 flex w-[300px] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/85 shadow-2xl backdrop-blur-md transition-all duration-300',
        p.assetPanelOpen
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      {p.assetPanelOpen && (
        <>
          <AssetLibraryHeader
            p={p}
            activeTab={ui.activeTab}
            onTabChange={ui.setActiveTab}
            onSaveSelected={() => void handleSaveSelected()}
            saving={saving}
          />

          <FolderBar
            p={p}
            scope={ui.scope}
            onScopeChange={ui.setScope}
            folderId={ui.folderId}
            onFolderChange={ui.setFolderId}
          />
          <AssetGrid
            p={p}
            mode={ui.activeTab}
            scope={ui.scope}
            folderId={ui.folderId === 'uncategorized' ? '' : ui.folderId}
            entries={ui.gridEntries}
            loading={ui.scope === 'global' && p.assetsLoading}
            hasMore={ui.scope === 'global' && ui.activeTab === 'images' && p.assetsHasMore}
            loadingMore={p.assetsLoadingMore}
            onLoadMore={() => void p.loadMoreGlobalAssets()}
          />
          <div className="shrink-0 border-t border-border/70 px-3 py-1.5">
            <p className="text-[10px] text-muted-foreground">
              {ui.scope === 'project' ? '项目资产随画布保存和导出' : '全局资产在所有画布共用'} · 共 {ui.scope === 'global' ? p.assetsTotal || ui.totalCount : ui.totalCount} 项
            </p>
          </div>
        </>
      )}
    </div>
  )
}
