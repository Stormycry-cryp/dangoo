import { Layers, Loader2, Plus, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

interface WorkbenchHeroProps {
  activeCount: number
  trashCount: number
  creating: boolean
  onCreate: () => void
}

export function WorkbenchHero(p: WorkbenchHeroProps) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-0 size-96 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-32 -left-24 size-72 rounded-full bg-secondary blur-3xl"
      />

      <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-6 py-16 md:py-24 lg:grid-cols-[3fr_2fr] lg:items-center">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm">
            <Sparkles className="size-3.5 text-primary" />
            智能画布 · 卡片式创作
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            把灵感摊开在
            <span className="text-primary">一块画布</span>
            上接着画
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            新建一块智能画布，把图片、视频和提示词素材摆在一起，随时交给
            AI 生成新的画面。所有画布都会替你存好，刷新、隔天再来都能接着上次继续。
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button
              size="lg"
              onClick={p.onCreate}
              disabled={p.creating}
              className="bg-primary text-primary-foreground shadow-lg hover:shadow-xl"
            >
              {p.creating ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Plus className="size-5" />
              )}
              新建智能画布
            </Button>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="rounded-full bg-card px-3 py-1 shadow-sm">
                {p.activeCount} 块画布在创作
              </span>
              {p.trashCount > 0 && (
                <span className="rounded-full bg-card px-3 py-1 shadow-sm">
                  回收站 {p.trashCount}
                </span>
              )}
            </div>
          </div>
        </div>

        <div
          aria-hidden
          className="relative hidden h-64 items-center justify-center lg:flex"
        >
          <div className="absolute left-6 top-4 w-52 -rotate-6 rounded-2xl border border-border bg-card p-3 shadow-xl">
            <div className="h-24 rounded-lg bg-gradient-to-br from-primary/25 via-muted to-secondary" />
            <div className="mt-3 h-2 w-2/3 rounded-full bg-muted" />
            <div className="mt-2 h-2 w-1/3 rounded-full bg-muted" />
          </div>
          <div className="absolute right-4 top-16 w-56 rotate-3 rounded-2xl border border-border bg-card p-3 shadow-2xl">
            <div className="flex h-28 items-center justify-center rounded-lg bg-gradient-to-br from-secondary via-muted to-primary/15">
              <Layers className="size-8 text-foreground/40" />
            </div>
            <div className="mt-3 h-2 w-1/2 rounded-full bg-muted" />
            <div className="mt-2 h-2 w-3/4 rounded-full bg-muted" />
          </div>
        </div>
      </div>
    </section>
  )
}
