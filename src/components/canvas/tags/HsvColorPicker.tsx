import { useCallback, useEffect, useRef } from 'react'
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from './tagModel'

// 自研 HSV 拾色器(不引第三方库): SV 方形面板 + 色相条。
// 仅标签色块本身允许内联 hex(用户内容数据), 外壳全部走主题 token。

interface HsvColorPickerProps {
  color: string
  onChange: (hex: string) => void
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function HsvColorPicker({ color, onChange }: HsvColorPickerProps) {
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const dragKind = useRef<null | 'sv' | 'hue'>(null)
  const hsv: Hsv = hexToHsv(normalizeHex(color) ?? '#F5A623')
  const pureHue = hsvToHex({ h: hsv.h, s: 1, v: 1 })

  const updateFromSv = useCallback(
    (clientX: number, clientY: number) => {
      const el = svRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const s = clamp((clientX - rect.left) / rect.width, 0, 1)
      const v = 1 - clamp((clientY - rect.top) / rect.height, 0, 1)
      onChange(hsvToHex({ h: hsv.h, s, v }))
    },
    [hsv.h, onChange],
  )

  const updateFromHue = useCallback(
    (clientX: number) => {
      const el = hueRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const h = clamp((clientX - rect.left) / rect.width, 0, 1) * 360
      onChange(hsvToHex({ h, s: hsv.s, v: hsv.v }))
    },
    [hsv.s, hsv.v, onChange],
  )

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (dragKind.current === 'sv') updateFromSv(e.clientX, e.clientY)
      else if (dragKind.current === 'hue') updateFromHue(e.clientX)
    }
    const onUp = () => {
      dragKind.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [updateFromSv, updateFromHue])

  return (
    <div className="w-full select-none space-y-3" onPointerDown={e => e.stopPropagation()}>
      {/* 饱和度/明度方形面板 */}
      <div
        ref={svRef}
        role="slider"
        aria-label="饱和度与明度"
        className="relative h-48 w-full cursor-crosshair overflow-hidden rounded-xl border border-border"
        style={{
          backgroundColor: pureHue,
          backgroundImage:
            'linear-gradient(to right, #ffffff, rgba(255,255,255,0)), linear-gradient(to top, #000000, rgba(0,0,0,0))',
        }}
        onPointerDown={e => {
          e.preventDefault()
          dragKind.current = 'sv'
          updateFromSv(e.clientX, e.clientY)
        }}
      >
        <span
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: color }}
        />
      </div>
      {/* 色相条 */}
      <div
        ref={hueRef}
        role="slider"
        aria-label="色相"
        className="relative h-3 w-full cursor-pointer rounded-full border border-border"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
        }}
        onPointerDown={e => {
          e.preventDefault()
          dragKind.current = 'hue'
          updateFromHue(e.clientX)
        }}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
          style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: pureHue }}
        />
      </div>
    </div>
  )
}
