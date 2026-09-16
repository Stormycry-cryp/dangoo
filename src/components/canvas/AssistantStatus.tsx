import { useState } from 'react'
import { Clapperboard, Download, Loader2 } from 'lucide-react'
import { getBasename } from '@/lib/pb'
import type { useCanvas } from '@/pages/Canvas/useCanvas'

type CanvasVm = ReturnType<typeof useCanvas>

function assistantZipUrl(): string {
  const base = getBasename()
  return `${base === '/' ? '' : base}/desktop-assistant.zip`
}

/** 顶栏本地助手状态: 助手在跑=已连接(主色), 不在跑=灰。具体软件(剪映/PS/AI)打开与否交给导出按钮的提示。 */
export function AssistantStatus({ p }: { p: CanvasVm }) {
  const a = p.assistant
  const [open, setOpen] = useState(false)
  const online = a.ok

  let dot = 'bg-muted-foreground/50'
  let text = '助手未运行'
  if (online) {
    dot = 'bg-primary'
    text = '本地助手已连接'
  }

  return (
    <span className="relative hidden md:inline-flex">
      <button
        type="button"
        title="本地助手: 把生成好的图/视频一键导入你电脑上的剪映、Photoshop 或 Illustrator"
        onClick={e => {
          e.stopPropagation()
          setOpen(v => !v)
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {p.jianyingImporting
          ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          : <Clapperboard className="h-3.5 w-3.5 text-primary" />}
        {p.jianyingImporting ? '导入剪映中…' : text}
        {!p.jianyingImporting && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      </button>

      {open && (
        <>
          {/* 点外面关闭 */}
          <span className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setOpen(false) }} />
          <div
            className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-border bg-card p-3 text-left shadow-lg"
            onPointerDown={e => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-foreground">一键导出 · 本地助手</p>
            {online ? (
              <>
                <p className="mt-1 text-xs leading-relaxed text-foreground">
                  助手已连接。请打开对应软件并点击卡片上的导出按钮:
                </p>
                <ul className="mt-2 space-y-1 pl-1 text-xs leading-relaxed text-muted-foreground">
                  <li>· 剪映: 打开剪映专业版并进入一个工程, 点「导入剪映」</li>
                  <li>· Photoshop: 打开 PS(有文档则置入新图层, 无文档则直接打开图片), 点「PS」</li>
                  <li>· Illustrator: 打开 AI 后点「AI」, 无文档时图片会自动新建文档</li>
                </ul>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/80">
                  当前状态:
                  {' '}
                  {a.jianying?.running ? '剪映运行中' : '剪映未打开'}
                  {' · '}
                  {a.photoshop?.running ? 'PS 运行中' : 'PS 未打开'}
                  {' · '}
                  {a.illustrator?.running ? 'AI 运行中' : 'AI 未打开'}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  导入剪映 / Photoshop / Illustrator 需要你电脑上运行一个小助手(网页无法直接操作你的桌面)。第一次用请先下载:
                </p>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
                  <li>下载并解压助手压缩包(已自带运行环境, 电脑上什么都不用装);</li>
                  <li>双击解压目录里的 start.bat, 黑色窗口显示运行中即可最小化;</li>
                  <li>打开要导出的软件(剪映需先进入工程), 回到卡片点对应导出按钮。</li>
                </ol>
                <a
                  href={assistantZipUrl()}
                  download
                  onClick={e => e.stopPropagation()}
                  className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Download className="h-3.5 w-3.5" />
                  下载本地助手 (Windows)
                </a>
              </>
            )}
          </div>
        </>
      )}
    </span>
  )
}
