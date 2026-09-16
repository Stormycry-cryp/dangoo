import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { useCanvas } from '@/pages/Canvas/useCanvas'
import { mediaSrc } from '@/lib/media'

type CanvasVm = ReturnType<typeof useCanvas>

export function ImagePreviewDialog({ p }: { p: CanvasVm }) {
  return (
    <Dialog open={!!p.previewUrl} onOpenChange={v => !v && p.setPreviewUrl(null)}>
      <DialogContent className="max-w-4xl border-border bg-card p-3">
        {p.previewUrl &&
          (p.previewMediaType === 'video' ? (
            <video src={mediaSrc(p.previewUrl)} controls autoPlay className="max-h-[72vh] w-full rounded-lg shadow-lg" />
          ) : (
            <img
              src={mediaSrc(p.previewUrl)}
              alt="预览"
              className="max-h-[72vh] w-full rounded-lg object-contain shadow-lg"
            />
          ))}
      </DialogContent>
    </Dialog>
  )
}
