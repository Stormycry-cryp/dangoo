import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

interface RenameDialogProps {
  open: boolean
  value: string
  renaming: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}

export function RenameDialog(p: RenameDialogProps) {
  return (
    <Dialog
      open={p.open}
      onOpenChange={(open) => {
        if (!open) p.onCancel()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>重命名画布</DialogTitle>
          <DialogDescription>给这块画布起个好记的名字。</DialogDescription>
        </DialogHeader>
        <Input
          value={p.value}
          maxLength={120}
          placeholder="画布名称"
          autoFocus
          onChange={(e) => p.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              p.onSubmit()
            }
          }}
          className="focus-visible:ring-2 focus-visible:ring-ring"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={p.onCancel} disabled={p.renaming}>
            取消
          </Button>
          <Button
            onClick={p.onSubmit}
            disabled={p.renaming || p.value.trim().length === 0}
            className="bg-primary text-primary-foreground"
          >
            {p.renaming && <Loader2 className="size-4 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
