import { formatDistanceToNow } from "date-fns"
import { zhCN } from "date-fns/locale"
import { Loader2, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { CanvasRecord } from "@/pages/Home/useHome"

interface TrashDialogProps {
  open: boolean
  items: CanvasRecord[]
  busyId: string | null
  onOpenChange: (open: boolean) => void
  onRestore: (canvas: CanvasRecord) => void
  onPurge: (canvas: CanvasRecord) => void
}

export function TrashDialog(p: TrashDialogProps) {
  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>回收站</DialogTitle>
          <DialogDescription>
            删除的画布会先放在这里，可以恢复回工作台，也可以彻底删除。
          </DialogDescription>
        </DialogHeader>

        {p.items.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border bg-muted/40 p-10 text-center">
            <p className="text-sm text-muted-foreground">回收站是空的</p>
          </div>
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {p.items.map((canvas) => {
              const busy = p.busyId === canvas.id
              const deletedAt = new Date(canvas.updated)
              const deletedLabel = Number.isNaN(deletedAt.getTime())
                ? ""
                : formatDistanceToNow(deletedAt, {
                    addSuffix: true,
                    locale: zhCN,
                  })
              return (
                <li
                  key={canvas.id}
                  className={`flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm ${
                    busy ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-muted to-secondary">
                    <Trash2 className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-card-foreground">
                      {canvas.title}
                    </p>
                    {deletedLabel && (
                      <p className="text-xs text-muted-foreground">
                        删除于 {deletedLabel}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => p.onRestore(canvas)}
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                    恢复
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => p.onPurge(canvas)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    彻底删除
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
