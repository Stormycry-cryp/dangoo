import { formatDistanceToNow } from "date-fns"
import { zhCN } from "date-fns/locale"
import { Layers, Loader2, Pencil, Trash2 } from "lucide-react"
import type { CanvasRecord } from "@/pages/Home/useHome"

interface CanvasCardProps {
  canvas: CanvasRecord
  busy: boolean
  onOpen: (canvas: CanvasRecord) => void
  onRenameStart: (canvas: CanvasRecord) => void
  onDelete: (canvas: CanvasRecord) => void
}

const COVER_GRADIENTS = [
  "bg-gradient-to-br from-primary/25 via-muted to-secondary",
  "bg-gradient-to-br from-secondary via-muted to-primary/15",
  "bg-gradient-to-br from-accent via-secondary to-muted",
]

function pickGradient(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % 997
  return COVER_GRADIENTS[hash % COVER_GRADIENTS.length]
}

export function CanvasCard(p: CanvasCardProps) {
  const { canvas } = p
  const updatedAt = new Date(canvas.updated)
  const updatedLabel = Number.isNaN(updatedAt.getTime())
    ? "刚刚更新"
    : formatDistanceToNow(updatedAt, { addSuffix: true, locale: zhCN })

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => p.onOpen(canvas)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          p.onOpen(canvas)
        }
      }}
      className={`group cursor-pointer overflow-hidden rounded-2xl border border-border bg-card text-left shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        p.busy ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <div className="relative aspect-video overflow-hidden">
        {canvas.thumbnail_url ? (
          <img
            src={canvas.thumbnail_url}
            alt={canvas.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center ${pickGradient(canvas.id)}`}
          >
            <Layers className="size-8 text-foreground/40 transition-transform duration-300 group-hover:scale-110" />
          </div>
        )}
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            aria-label="重命名画布"
            onClick={(e) => {
              e.stopPropagation()
              p.onRenameStart(canvas)
            }}
            className="flex size-8 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            aria-label="删除画布"
            onClick={(e) => {
              e.stopPropagation()
              p.onDelete(canvas)
            }}
            className="flex size-8 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            {p.busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
          </button>
        </div>
      </div>
      <div className="p-4">
        <p className="truncate font-medium text-card-foreground">
          {canvas.title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">更新于 {updatedLabel}</p>
      </div>
    </div>
  )
}
