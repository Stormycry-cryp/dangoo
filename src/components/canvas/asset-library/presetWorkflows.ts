// 内置预设工作流: 不入库、不可删改, 始终置顶在「工作流」页签, 拖到画布即按模板建节点。
// 与用户自存工作流共用同一条拖放/重建链路(重建时换全新节点 id, 不带任何运行结果)。
import type { WorkflowDoc } from '@/pages/Canvas/canvasTypes'
import { AI_APP_LONG_EDGE_DEFAULT, AI_APP_USER_PRICE, TTS_PRICE_TEXT, MOTION_PRICE_TEXT } from '@/pages/Canvas/canvasModels'
import { defaultTtsState, defaultMotionState, defaultVsrState } from '@/pages/Canvas/canvasTypes'
import type { AssetLibEntry } from './assetLib'

interface PresetWorkflowDef {
  key: string
  displayName: string
  /** 封面区一句话说明(预设卡专用) */
  tagline: string
  /** 悬停与卡面展示的站内价格文案 */
  priceText: string
  workflow: WorkflowDoc
}

/** WAN 2.2 图生视频: 单个生成节点, 模型已锁定; 拖入后挂一张参考图、写提示词即可运行 */
const WAN22_PRESET: PresetWorkflowDef = (() => {
  const model = 'wan-2.2-i2v-ai-app'
  const unit = AI_APP_USER_PRICE[model] ?? 0
  return {
    key: 'preset-wan22-i2v',
    displayName: 'WAN 2.2 图生视频',
    tagline: '图片一键生成动态视频',
    priceText: `¥${unit.toFixed(2)} / 次`,
    workflow: {
      version: 1,
      nodes: [
        {
          id: 'preset-wan22-node',
          kind: 'generate',
          x: 0,
          y: 0,
          w: 320,
          h: 180,
          // 应用参数: 图片(节点参考图位) + 提示词(节点文本) + 最长边, 与应用内加减器默认一致
          genParams: { model, count: 1, aiAppLongEdge: AI_APP_LONG_EDGE_DEFAULT },
        },
      ],
      edges: [],
    },
  }
})()

/** IndexTTS 2 语音克隆: 单个专用节点; 拖入后上传一段人声、填文本即可运行出 mp3 */
const TTS_PRESET: PresetWorkflowDef = {
  key: 'preset-indextts2',
  displayName: 'IndexTTS 2 语音克隆',
  tagline: '上传一段声音, 克隆语音念文本',
  priceText: TTS_PRICE_TEXT,
  workflow: {
    version: 1,
    nodes: [
      {
        id: 'preset-indextts2-node',
        kind: 'tts',
        x: 0,
        y: 0,
        w: 380,
        h: 600,
        ttsState: defaultTtsState(),
      },
    ],
    edges: [],
  },
}

/** Animate 动作迁移 V9: 单个专用节点; 拖入后上传人物照片和动作视频即可运行出新视频 */
const MOTION_PRESET: PresetWorkflowDef = {
  key: 'preset-animatev9',
  displayName: 'Animate 动作迁移',
  tagline: '人物照片跟着动作视频动起来',
  priceText: MOTION_PRICE_TEXT,
  workflow: {
    version: 1,
    nodes: [
      {
        id: 'preset-animatev9-node',
        kind: 'motion',
        x: 0,
        y: 0,
        w: 380,
        h: 620,
        motionState: defaultMotionState(),
      },
    ],
    edges: [],
  },
}

/** 视频高清修复: 单个专用节点; 拖入后上传一段模糊视频即可运行出高清视频 */
const VSR_PRESET: PresetWorkflowDef = {
  key: 'preset-videovsr',
  displayName: '视频高清修复',
  tagline: '模糊视频一键修复成高清',
  priceText: '¥1.50 – 3.00 / 次',
  workflow: {
    version: 1,
    nodes: [
      {
        id: 'preset-videovsr-node',
        kind: 'vsr',
        x: 0,
        y: 0,
        w: 380,
        h: 560,
        vsrState: defaultVsrState(),
      },
    ],
    edges: [],
  },
}

// WAN 2.2 · 6秒高质量预设已下线(不再从工作流面板新建); 渠道/后端保留, 已存画布与自存工作流里的该类节点仍可正常运行
const PRESETS: PresetWorkflowDef[] = [WAN22_PRESET, TTS_PRESET, MOTION_PRESET, VSR_PRESET]

/** 预设条目: scope/folderId 仅满足类型, 不参与库归属与文件夹过滤, 也不会被保存/删除 */
export const PRESET_WORKFLOW_ENTRIES: AssetLibEntry[] = PRESETS.map(d => ({
  key: d.key,
  scope: 'project',
  kind: 'workflow',
  displayName: d.displayName,
  coverUrl: '',
  members: [],
  folderId: '',
  workflow: d.workflow,
  preset: true,
  tagline: d.tagline,
  priceText: d.priceText,
}))
