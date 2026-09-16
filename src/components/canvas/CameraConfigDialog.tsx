import { useEffect, useState } from 'react'
import { BookmarkPlus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  CAMERA_DICTIONARY,
  CAMERA_NOT_SPECIFIED,
  CAMERA_NOT_SPECIFIED_LABEL,
  MAX_CAMERA_PRESETS,
  MAX_EFFECTS_SELECTED,
  cameraApertureOption,
  cameraFocalOption,
  cameraFocalsFor,
  cameraLensOf,
  cameraLensesForBody,
  cameraSummaryFromConfig,
  deleteCameraPreset,
  loadCameraDefault,
  loadCameraPresets,
  reconcileConfigForBody,
  reconcileConfigForLens,
  sanitizeCameraConfig,
  saveCameraDefault,
  saveCameraPreset,
  type CameraConfig,
  type CameraPreset,
} from '@/pages/Canvas/cameraModel'
import type { useCanvas } from '@/pages/Canvas/useCanvas'

type CanvasVm = ReturnType<typeof useCanvas>

const PRESET_VALUE_PREFIX = 'preset:'
const DEFAULT_VALUE = '__default__'

function compactSummary(config: CameraConfig): string {
  const s = cameraSummaryFromConfig(config)
  return `${s.title} / ${s.sub} / ${s.meta}`
}

/** 弹窗右上角的「默认 / 预设」载入下拉 */
function PresetLoadSelect({
  presets,
  defaultConfig,
  onLoad,
}: {
  presets: CameraPreset[]
  defaultConfig: CameraConfig
  onLoad: (config: CameraConfig) => void
}) {
  const [value, setValue] = useState('')
  return (
    <Select
      value={value}
      onValueChange={v => {
        setValue('')
        if (v === DEFAULT_VALUE) {
          onLoad(sanitizeCameraConfig(defaultConfig))
          return
        }
        if (v.startsWith(PRESET_VALUE_PREFIX)) {
          const preset = presets.find(p => p.id === v.slice(PRESET_VALUE_PREFIX.length))
          if (preset) onLoad(sanitizeCameraConfig(preset.config))
        }
      }}
    >
      <SelectTrigger className="h-8 w-44 text-xs" aria-label="载入默认配置或镜头预设">
        <SelectValue placeholder="默认" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value={DEFAULT_VALUE}>
            <span className="text-xs">默认配置 · {compactSummary(defaultConfig)}</span>
          </SelectItem>
        </SelectGroup>
        {presets.length > 0 && (
          <SelectGroup>
            <SelectLabel>镜头预设 ({presets.length}/{MAX_CAMERA_PRESETS})</SelectLabel>
            {presets.map(preset => (
              <SelectItem key={preset.id} value={`${PRESET_VALUE_PREFIX}${preset.id}`}>
                <span className="text-xs">{preset.name} · {compactSummary(preset.config)}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  )
}

/** 四选一的小下拉(机身/镜头/焦段/光圈) */
function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>
              <span className="text-xs">{opt.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

/** 明度九调(单选) / 镜头特效(多选) 胶囊组 */
function ChipRow({
  items,
  selectedIds,
  disabledIds,
  onToggle,
}: {
  items: Array<{ id: string; label: string }>
  selectedIds: string[]
  disabledIds?: string[]
  onToggle: (id: string) => void
}) {
  const disabled = new Set(disabledIds ?? [])
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(item => {
        const active = selectedIds.includes(item.id)
        const isDisabled = !active && disabled.has(item.id)
        return (
          <button
            key={item.id}
            type="button"
            disabled={isDisabled}
            onClick={() => onToggle(item.id)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              active
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-border bg-background/50 text-card-foreground hover:border-primary/60 hover:text-primary'
            }`}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

/** 已存预设芯片行: 单击载入, hover 出删除钮 */
function PresetChipRow({
  presets,
  onLoad,
  onDelete,
}: {
  presets: CameraPreset[]
  onLoad: (preset: CameraPreset) => void
  onDelete: (id: string) => void
}) {
  if (presets.length === 0) {
    return <p className="text-[11px] text-muted-foreground/70">还没有镜头预设, 调好一组参数后可存为预设</p>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map(preset => (
        <span
          key={preset.id}
          className="group flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-xs text-card-foreground"
        >
          <button type="button" className="max-w-44 truncate hover:text-primary" onClick={() => onLoad(preset)} title="载入该预设">
            {preset.name}
          </button>
          <button
            type="button"
            title="删除该预设"
            onClick={() => onDelete(preset.id)}
            className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  )
}

/** 实际内容组件: open 时才挂载, 保证每次打开都是节点最新配置的草稿 */
function CameraConfigEditor({ p, cardId }: { p: CanvasVm; cardId: string }) {
  const card = p.cards.find(c => c.id === cardId)
  const [draft, setDraft] = useState<CameraConfig>(() => sanitizeCameraConfig(card?.cameraState ?? loadCameraDefault()))
  const [presets, setPresets] = useState<CameraPreset[]>(() => loadCameraPresets())
  const [defaultConfig, setDefaultConfig] = useState<CameraConfig>(() => loadCameraDefault())

  // 弹窗打开期间节点被删除(理论上弹窗遮罩挡住画布操作, 这里仅做兜底)
  useEffect(() => {
    if (!card) p.setCameraConfigCardId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!card])

  const lens = cameraLensOf(draft.lensId)
  // 镜头只列出兼容当前机身的(挂载表); 焦段随「机身×镜头」组合变化, 光圈随镜头
  const lensOptions = cameraLensesForBody(draft.bodyId)
  const focalValues = cameraFocalsFor(draft.bodyId, draft.lensId)
  // 焦段 / 光圈可选「不指定」(该段不进提示词), 「不指定」对任何组合都保留
  const focalUnspecified = draft.focalValue === CAMERA_NOT_SPECIFIED
  const apertureUnspecified = draft.apertureValue === CAMERA_NOT_SPECIFIED
  const focal = focalUnspecified ? undefined : cameraFocalOption(focalValues.includes(draft.focalValue) ? draft.focalValue : focalValues[0])
  const aperture = apertureUnspecified
    ? undefined
    : cameraApertureOption(lens.apertures.includes(draft.apertureValue) ? draft.apertureValue : lens.apertures[0])
  const allowedEffects = CAMERA_DICTIONARY.effects.filter(e => lens.effectIds.includes(e.id))
  const presetFull = presets.length >= MAX_CAMERA_PRESETS

  const patch = (next: Partial<CameraConfig>) => setDraft(prev => sanitizeCameraConfig({ ...prev, ...next }))

  /** 切机身: 镜头列表随之过滤, 不兼容时自动换成该机身第一支可用镜头; 只改草稿不落盘 */
  const changeBody = (bodyId: string) =>
    setDraft(prev => {
      const next = reconcileConfigForBody(prev, bodyId)
      // 原镜头装不上新机身时给一句轻提示, 让用户知道镜头被自动换了
      if (next.lensId !== prev.lensId) {
        const switched = cameraLensesForBody(bodyId).find(l => l.id === next.lensId)
        if (switched) toast.info(`该机身不支持当前镜头, 已切换为「${switched.name}」`)
      }
      return next
    })

  /** 切镜头: 焦段 / 光圈 / 特效立即按新镜头校验预览, 但只改草稿不落盘 */
  const changeLens = (lensId: string) => setDraft(prev => reconcileConfigForLens(prev, lensId))

  const toggleEffect = (effectId: string) => {
    const effect = CAMERA_DICTIONARY.effects.find(e => e.id === effectId)
    if (!effect) return
    const has = draft.effectIds.includes(effectId)
    if (has) {
      patch({ effectIds: draft.effectIds.filter(id => id !== effectId) })
      return
    }
    if (draft.effectIds.length >= MAX_EFFECTS_SELECTED) {
      toast.info(`镜头特效最多选 ${MAX_EFFECTS_SELECTED} 个`)
      return
    }
    // 互斥组成员已选时不允许加入(由清洗兜底, UI 上直接禁用更直观)
    if (effect.group) {
      const clash = CAMERA_DICTIONARY.effects.find(e => draft.effectIds.includes(e.id) && e.group === effect.group)
      if (clash) {
        toast.info(`「${clash.label}」与「${effect.label}」互斥, 请先取消前者`)
        return
      }
    }
    patch({ effectIds: [...draft.effectIds, effectId] })
  }

  // 同互斥组已选的其它特效禁用
  const selectedGroups = new Set(
    draft.effectIds
      .map(id => CAMERA_DICTIONARY.effects.find(e => e.id === id)?.group)
      .filter((g): g is string => !!g),
  )
  const effectDisabledIds = allowedEffects
    .filter(e => e.group && selectedGroups.has(e.group) && !draft.effectIds.includes(e.id))
    .map(e => e.id)

  const applyConfig = () => {
    p.applyCameraConfig(cardId, sanitizeCameraConfig(draft))
    p.setCameraConfigCardId(null)
  }

  const saveAsDefault = () => {
    if (saveCameraDefault(draft)) {
      setDefaultConfig(sanitizeCameraConfig(draft))
      toast.success('已保存为默认配置, 新建摄影机时使用')
    } else {
      toast.error('默认配置保存失败, 浏览器存储不可用')
    }
  }

  const saveAsPreset = () => {
    if (presetFull) {
      toast.error(`镜头预设最多保存 ${MAX_CAMERA_PRESETS} 个, 请先删除不用的`)
      return
    }
    const preset = saveCameraPreset('', draft)
    if (preset) {
      setPresets(loadCameraPresets())
      toast.success(`已保存预设「${preset.name}」`)
    } else {
      toast.error('镜头预设保存失败, 浏览器存储不可用')
    }
  }

  const removePreset = (presetId: string) => {
    setPresets(deleteCameraPreset(presetId))
    toast.success('预设已删除')
  }

  return (
    <DialogContent
      className="max-h-[88vh] max-w-2xl gap-4 overflow-y-auto"
      onOpenAutoFocus={e => e.preventDefault()}
    >
      <DialogHeader className="pr-10">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle>摄影机控制</DialogTitle>
            <p className="mt-1 text-xs text-muted-foreground">{card?.title ?? '摄影机'} · 配置只影响绑定它的生成节点</p>
          </div>
          <PresetLoadSelect presets={presets} defaultConfig={defaultConfig} onLoad={setDraft} />
        </div>
      </DialogHeader>

      {/* 机身 / 镜头 / 焦段 / 光圈 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <FieldSelect
          label="机身"
          value={draft.bodyId}
          options={CAMERA_DICTIONARY.bodies.map(b => ({ value: b.id, label: b.name }))}
          onChange={changeBody}
        />
        <FieldSelect
          label="镜头"
          value={draft.lensId}
          options={lensOptions.map(l => ({ value: l.id, label: l.name }))}
          onChange={changeLens}
        />
        <FieldSelect
          label="焦段"
          value={draft.focalValue}
          options={[
            { value: CAMERA_NOT_SPECIFIED, label: CAMERA_NOT_SPECIFIED_LABEL },
            ...focalValues.map(v => ({ value: v, label: v })),
          ]}
          onChange={v => patch({ focalValue: v })}
        />
        <FieldSelect
          label="光圈"
          value={draft.apertureValue}
          options={[
            { value: CAMERA_NOT_SPECIFIED, label: CAMERA_NOT_SPECIFIED_LABEL },
            ...lens.apertures.map(v => ({ value: v, label: v })),
          ]}
          onChange={v => patch({ apertureValue: v })}
        />
      </div>

      {/* 信息面板: 专属成像质感 + 适配画面 */}
      <div className="space-y-2 rounded-lg border border-border bg-card p-3 shadow-sm">
        <div>
          <p className="mb-1 text-[11px] font-semibold text-primary">专属成像质感</p>
          <p className="text-xs leading-relaxed text-card-foreground">{lens.lookPrompt}</p>
        </div>
        <div className="h-px bg-border" />
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-primary">适配画面</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            焦段说明:{focalUnspecified ? `${CAMERA_NOT_SPECIFIED_LABEL}(不写入提示词)` : focal!.desc} ｜ 光圈说明:
            {apertureUnspecified ? `${CAMERA_NOT_SPECIFIED_LABEL}(不写入提示词)` : aperture!.desc}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">适用场景:{lens.scene}</p>
        </div>
      </div>

      {/* 明度九调 */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-muted-foreground">明度</p>
        <ChipRow
          items={CAMERA_DICTIONARY.tones.map(t => ({ id: t.id, label: t.label }))}
          selectedIds={[draft.toneId]}
          onToggle={id => patch({ toneId: id })}
        />
      </div>

      {/* 镜头特效 */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-muted-foreground">
          镜头特效 <span className="font-normal text-muted-foreground/70">可多选, 最多 {MAX_EFFECTS_SELECTED} 个</span>
        </p>
        <ChipRow
          items={allowedEffects.map(e => ({ id: e.id, label: e.label }))}
          selectedIds={draft.effectIds}
          disabledIds={effectDisabledIds}
          onToggle={toggleEffect}
        />
      </div>

      {/* 摄影风格提示词不在界面展示: 应用后仅在生成时追加到最终请求提示词末尾 */}

      {/* 预设管理 */}
      <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-2.5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveAsDefault}
            className="rounded-md border border-dashed border-border bg-background/60 px-2.5 py-1.5 text-xs text-card-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Save className="mr-1 inline h-3.5 w-3.5" />
            保存当前配置为默认
          </button>
          <button
            type="button"
            onClick={saveAsPreset}
            disabled={presetFull}
            title={presetFull ? `最多保存 ${MAX_CAMERA_PRESETS} 个预设` : '存为镜头预设, 可在右上角下拉载入'}
            className="rounded-md border border-dashed border-border bg-background/60 px-2.5 py-1.5 text-xs text-card-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <BookmarkPlus className="mr-1 inline h-3.5 w-3.5" />
            保存当前配置为预设 ({presets.length}/{MAX_CAMERA_PRESETS})
          </button>
        </div>
        <PresetChipRow
          presets={presets}
          onLoad={preset => setDraft(sanitizeCameraConfig(preset.config))}
          onDelete={removePreset}
        />
      </div>

      {/* 底部操作 */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => p.setCameraConfigCardId(null)}>
          取消
        </Button>
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={applyConfig}>
          应用
        </Button>
      </div>
    </DialogContent>
  )
}

/** 摄影机控制弹窗: 由 VM 的 cameraConfigCardId 驱动开合, Esc / 遮罩 = 取消 */
export function CameraConfigDialog({ p }: { p: CanvasVm }) {
  const cardId = p.cameraConfigCardId
  return (
    <Dialog
      open={!!cardId}
      onOpenChange={open => {
        if (!open) p.setCameraConfigCardId(null)
      }}
    >
      {cardId ? <CameraConfigEditor key={cardId} p={p} cardId={cardId} /> : null}
    </Dialog>
  )
}
