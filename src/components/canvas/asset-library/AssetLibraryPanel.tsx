import { useState } from 'react'
import { Images, PanelRightClose, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { useCanvas } from '@/pages/Canvas/useCanvas'
import { useAssetLibraryPanel } from './useAssetLibraryPanel'
import { AssetLibraryHeader } from './AssetLibraryHeader'
import { FolderBar } from './FolderBar'
import { AssetGrid } from './AssetGrid'
import { GeneratedAssetsSection } from './generated/GeneratedAssetsSection'

type CanvasVm = ReturnType<typeof useCanvas>
type PanelSection = 'library' | 'generated'

/**
 * 右侧资产库浮动面板: 悬浮在画布右上方, 不挤压画布;
 * 收起用 opacity/visibility/pointer-events 过渡, 收起时不拦截画布手势。
 * 顶部分两区: 「素材库」(原有项目/全局收藏上传, 行为不变) 与「全部产物」(历史生成产物聚合)。
 */
export function AssetLibraryPanel({ p }: { p: CanvasVm }) {
  const ui = useAssetLibraryPanel(p)
  const [saving, setSaving] = useState(false)
  const [section, setSection] = useState<PanelSection>('library')

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
          {/* 分区切换 */}
          <div className="flex shrink-0 items-center gap-1 border-b border-border/70 bg-muted/40 px-2.5 pt-2">
            <button
              type="button"
              onClick={() => setSection('library')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-t-lg border-b-2 px-2 pb-2 pt-1 text-xs font-medium transition-colors',
                section === 'library'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Images className="h-3.5 w-3.5" />
              素材库
            </button>
            <button
              type="button"
              onClick={() => setSection('generated')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-t-lg border-b-2 px-2 pb-2 pt-1 text-xs font-medium transition-colors',
                section === 'generated'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              全部产物
            </button>
            <button
              type="button"
              title="收起面板"
              onClick={() => p.setAssetPanelOpen(false)}
              className="ml-1 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>

          {section === 'library' ? (
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
          ) : (
            <GeneratedAssetsSection p={p} />
          )}
        </>
      )}
    </div>
  )
}
