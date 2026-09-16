import { Loader2, Plus, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CanvasCard } from "@/components/home/CanvasCard"
import type { CanvasRecord } from "@/pages/Home/useHome"

interface CanvasGridProps {
  canvases: CanvasRecord[]
  isLoading: boolean
  loadError: string | null
  creating: boolean
  busyId: string | null
  onCreate: () => void
  onOpen: (canvas: CanvasRecord) => void
  onRenameStart: (canvas: CanvasRecord) => void
  onDelete: (canvas: CanvasRecord) => void
  onReload: () => void
}

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-border bg-card shadow-md">
      <div className="aspect-video bg-muted" />
      <div className="p-4">
        <div className="h-3 w-2/3 rounded-full bg-muted" />
        <div className="mt-3 h-2 w-1/3 rounded-full bg-muted" />
      </div>
    </div>
  )
}

export function CanvasGrid(p: CanvasGridProps) {
  const isEmpty = !p.isLoading && !p.loadError && p.canvases.length === 0

  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-24">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">最近画布</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            点卡片直接打开，悬停卡片可以改名或删除
          </p>
        </div>
        {p.canvases.length > 0 && (
          <span className="rounded-full bg-card px-3 py-1 text-sm text-muted-foreground shadow-sm">
            共 {p.canvases.length} 块
          </span>
        )}
      </div>

      {p.loadError ? (
        <div className="rounded-3xl border-2 border-dashed border-border bg-card/50 p-12 text-center shadow-sm">
          <p className="text-muted-foreground">{p.loadError}</p>
          <Button variant="outline" className="mt-5" onClick={p.onReload}>
            <RefreshCw className="size-4" />
            重新加载
          </Button>
        </div>
      ) : isEmpty ? (
        <div className="animate-in fade-in duration-500 rounded-3xl border-2 border-dashed border-border bg-card/50 p-12 text-center shadow-sm md:p-16">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Plus className="size-7 text-primary" />
          </div>
          <h3 className="mt-6 text-2xl font-semibold text-foreground">
            还没有画布
          </h3>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            从一块空白智能画布开始，把图片、视频和灵感素材摆上去，创作进度会自动保存，随时回来接着画。
          </p>
          <Button
            size="lg"
            disabled={p.creating}
            onClick={p.onCreate}
            className="mt-8 bg-primary text-primary-foreground shadow-lg"
          >
            {p.creating ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Plus className="size-5" />
            )}
            新建第一块画布
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            onClick={p.onCreate}
            disabled={p.creating || p.isLoading}
            className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card/40 p-8 text-center transition-all duration-300 hover:-translate-y-0.5 hover:border-primary hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/10">
              {p.creating ? (
                <Loader2 className="size-5 animate-spin text-primary" />
              ) : (
                <Plus className="size-5 text-primary" />
              )}
            </span>
            <span className="font-medium text-foreground">新建智能画布</span>
            <span className="text-xs text-muted-foreground">
              从一张空白画布开始
            </span>
          </button>

          {p.isLoading
            ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
            : p.canvases.map((canvas) => (
                <CanvasCard
                  key={canvas.id}
                  canvas={canvas}
                  busy={p.busyId === canvas.id}
                  onOpen={p.onOpen}
                  onRenameStart={p.onRenameStart}
                  onDelete={p.onDelete}
                />
              ))}
        </div>
      )}
    </section>
  )
}
