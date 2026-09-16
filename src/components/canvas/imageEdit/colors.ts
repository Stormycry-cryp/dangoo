// 图片编辑器内容色: 画笔颜料 / 颜色图钉等用户可自由选择的标记色。
// 属于用户内容数据(类似画笔选色), 不是界面主题色; 界面结构色(背景/边框/主按钮)仍全部使用 shadcn token。
// canvas 2d 绘制用 hsl 字符串; DOM 色块用 index.css 里的 cnt-* 自定义类(非内联颜色、非 Tailwind 默认调色板)。

export type PinColorKey = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple'
export type DrawColorKey = PinColorKey | 'white' | 'black'

export interface ContentColor {
  key: DrawColorKey
  label: string
  /** canvas 2d fill/stroke 颜色 */
  hsl: string
  /** DOM 色块类名(index.css 中定义) */
  cssClass: string
}

export const DRAW_COLORS: ContentColor[] = [
  { key: 'red', label: '红色', hsl: 'hsl(0, 72%, 56%)', cssClass: 'cnt-red' },
  { key: 'orange', label: '橙色', hsl: 'hsl(28, 92%, 58%)', cssClass: 'cnt-orange' },
  { key: 'yellow', label: '黄色', hsl: 'hsl(48, 96%, 60%)', cssClass: 'cnt-yellow' },
  { key: 'green', label: '绿色', hsl: 'hsl(145, 63%, 46%)', cssClass: 'cnt-green' },
  { key: 'blue', label: '蓝色', hsl: 'hsl(214, 90%, 60%)', cssClass: 'cnt-blue' },
  { key: 'purple', label: '紫色', hsl: 'hsl(270, 70%, 62%)', cssClass: 'cnt-purple' },
  { key: 'white', label: '白色', hsl: 'hsl(0, 0%, 96%)', cssClass: 'cnt-white' },
  { key: 'black', label: '黑色', hsl: 'hsl(0, 0%, 12%)', cssClass: 'cnt-black' },
]

/** 颜色图钉只用 6 个彩色(无白/黑) */
export const PIN_COLORS: ContentColor[] = DRAW_COLORS.slice(0, 6)

export function contentColorOf(key: DrawColorKey): ContentColor {
  return DRAW_COLORS.find(c => c.key === key) ?? DRAW_COLORS[0]
}

export function pinCssClass(key: PinColorKey | undefined | null): string | null {
  if (!key) return null
  return contentColorOf(key).cssClass
}
