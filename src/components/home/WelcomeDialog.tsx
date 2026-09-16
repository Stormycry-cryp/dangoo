import { useState } from "react"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * 进入项目时的欢迎弹窗: 介绍 Dangoo 无限画布的版本规划与配套插件。
 * 每次打开首页展示, 点「开始创作」/遮罩/ESC 关闭。
 */
export function WelcomeDialog() {
  const [open, setOpen] = useState(true)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="size-5 shrink-0 text-primary" aria-hidden />
            欢迎来到Dangoo！无限创意
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            这是一款正在开发中的无限画布，后续会更新更好用的各种工作节点。
          </p>
          <p>
            软件分为在线版与本地版，本地版现已打通软件到
            <span className="font-medium text-foreground">PS / AI / 剪映</span>
            ，另有 AI-剪映插件已开发完成。
          </p>
          <p>
            具体使用问题可以点击
            <a
              href="https://www.runninghub.cn/user-center/1997914895226155009/webapp?inviteCode=hgimgsiw"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              作者个人主页
            </a>
            查看。
          </p>
        </div>

        <DialogFooter>
          <Button
            onClick={() => setOpen(false)}
            className="bg-primary text-primary-foreground"
          >
            开始创作
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
