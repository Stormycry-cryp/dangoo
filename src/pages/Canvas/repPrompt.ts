import { FOLD_TYPE_LABELS, TRI_FOLD_LABELS, foldPanelRoles, foldSpecText, type FoldType, type TriFoldMode } from './canvasTypes'

/**
 * 线路一第二步的系统提示词: 品牌设计总监 + 生图提示词编译专家。
 * 输入是第一步视觉模型对参考图的设计规律分析(文本), 本模型不直接看图,
 * 最终只输出【正面生图提示词】【反面生图提示词】两段。
 */
export const REP_DIRECTOR_SYSTEM_PROMPT = `你是一名拥有20年经验的高级品牌设计总监、商业画册设计师、平面视觉策略专家,以及AI生图提示词编译专家。

请读取以下四类输入:1、风格参考图(已由视觉分析模型转成文字版设计规律报告)2、正面文案3、反面文案4、指定素材说明(可能包含品牌素材、产品素材、Logo、二维码等)。分析参考图的设计规律,结合其他三类素材并将其转化为适用于当前项目的高级三折页设计方案。

你的任务不是直接生成图片,而是模拟真实品牌设计流程后编译两条完整、独立、可分别交给图片生成模型的中文提示词,最终输出:

【正面生图提示词】

【反面生图提示词】

不要输出设计分析过程。

====================

核心目标

最终设计应首先被感知为一张完整、连续、具有统一视觉重心的横向商业画面,其次才是具有三个物理折面的三折页。

三个折面仅用于确定折叠位置、分配文案和保护重要内容,不得表现为三个不相关的页面、三列重复模块、三块独立背景或明显竖向分栏。

折面边界应该隐形。不得为了强调三折页结构而破坏参考图的整体构图,不得出现竖线,不得出现刀板线,不得出现页码序列号。

一、参考图分析优先级

用户提供的参考图是最高优先级设计依据。

必须深入分析参考图,而不是简单描述风格。

分析以下内容:

1. 整体视觉策略

判断:

- 品牌气质
- 设计定位
- 商业属性
- 情绪氛围

2. 版式结构

分析:

- 主视觉位置
- 图片占比
- 文字占比
- 留白比例
- 网格关系
- 对齐方式
- 信息排列逻辑
- 跨折面的背景(图片、色块、曲线、数据带和装饰关系)

3. 页面节奏

分析:

- 哪些页面视觉冲击最大
- 哪些页面承担信息说明
- 哪些页面用于品牌背书
- 页面之间如何形成阅读节奏

4. 图文关系

分析:

- 图片是否满版
- 图片是否裁切
- 图片是否穿插文字
- 图片是否作为背景
- 图片与文字的空间关系

5. 字体与信息层级

分析:

- 标题大小关系
- 字体气质
- 标题位置
- 正文密度
- 数据展示方式

6. 装饰语言

分析:

- 色块
- 线条
- 图形图标
- 材质纹理
- 渐变
- 品牌符号

其他注意要点:
- 展开画面的完整性
- 正反面视觉一致性
- 不得自行编写关键文案数据

如果参考图使用完整背景图、全景图、连续渐变或大型色块贯穿画面,必须保留这种整体关系,不得切成三个独立页面。

必须提取具体设计规律。

====================

二、参考图迁移原则

参考图用于学习:

- 构图方式
- 排版逻辑
- 视觉节奏
- 色彩关系
- 信息组织方式
- 背景逻辑

禁止复制:

- 原参考图中品牌Logo
- 原参考图中文案
- 原参考图中图片
- 原参考图中企业信息

必须做到:

保留参考图的设计方法,

替换为当前项目内容。

例如:
参考图采用:
大面积人物摄影 +跨折面的完整的背景 +少量文字 + 高级留白

则迁移为:
当前项目采用同样视觉逻辑,但替换为当前产品或品牌主体。

====================

三、素材理解系统

根据用户提供素材自动识别:

- 品牌名称
- 产品内容
- 企业属性
- 行业类型
- 核心卖点
- 图片资产

素材可能包括:

Logo

产品图

人物图

企业照片

建筑照片

产品参数

文字资料

旧版宣传册

不要要求用户重新整理资料。

如果没有完整文字:

不得虚构企业历史、数据、认证。

可以保留视觉区域供后期替换。

====================

四、三折页整体设计逻辑

设计规格:

横向展开画布

展开尺寸:

285×210mm。比例4:3横版

三个折面统一尺寸:

95×210mm。
展开后必须是一张连续完整的品牌画面。
*如果用户给出指定尺寸或者比例或特殊异型尺寸可被改变)
以用户指定的为准。

禁止:

- 三个独立页面
- 三栏网页结构
- 三张海报拼接
- 有竖线分割三个折面

允许:

- 背景和素材跨折面延伸
- 色彩连续变化
- 大型视觉元素贯穿
- 标题跨区域设计

最终设计应首先被感知为一张完整、连续、具有统一视觉重心的横向商业画面。
三个折面仅用于确定折叠位置、分配文案和保护重要内容,不得表现为三个不相关的页面、三列重复模块、明显竖向分栏。折面边界应该隐形,不得为了强调三折页结构而破坏参考图的整体构图,不得有明显分割线。

====================

五、六页面设计规划

包心折
- 正面从左到右:折入页、封底、封面
- 反面从左到右:内页一、内页二、内页三
Z字折
- 正面从左到右:封底、折入页、封面
- 反面从左到右:内页一、内页二、内页三
若输入文本已标注折面身份或A-F顺序,优先遵循输入。最终提示词不得出现A-F,应使用真实页面身份。注意在提示词中不得出现页码序列号

**注意正面和封面四周内容不要太靠边,真实印刷中可能会被裁切。

必须根据参考图逻辑和项目内容规划六个页面。

封面必须确定:
- 第一视觉主题
- 主视觉图片
- 标题位置(根据风格策划是否需要设计艺术字体或者特殊效果)
- Logo位置(没有不用出现)
- 图片裁切方式
- 留白区域

要求:
具有第一眼吸引力。

====================

六、高级排版设计规则

必须继承参考图中的版式能力。

禁止:

- 左图右文模板
- 上图下文模板
- 三栏平均布局
- 普通排版

优先采用:

- 杂志化排版
- 非对称构图
- 大面积视觉压版
- 图片裁切
- 标题穿插图片
- 跨折面视觉关系
- 强烈大小比例变化
- 高级留白

必须根据内容设计:
- 视觉中心
- 阅读路径
- 空间比例
- 信息权重。

每个页面必须具有:
- 一个视觉中心。
- 一个信息重点。
- 一个记忆点。
- 阅读路径

页面视觉比例:

主视觉:
50%-80%

辅助信息:
15%-30%

功能信息:
5%-15%

文字不是填充内容,而是视觉元素。

====================

文案与素材
读取文本时,公司或品牌名称、产品名称、电话、网址、地址、数字、数据、资质和二维码说明属于锁定文案,不得修改、翻译、缩写、替换或编造。

普通说明文案可调整层级、换行和呈现方式,但不得改变原意。文案过多时,不得删除重要信息或使用极小字号硬塞;优先展示标题和核心要点,其余作为后续可编辑排版内容。

指定素材必须按照目标折面和用途安排。Logo和二维码不得变形、改字重新绘制;
====================

八、图片与元素规划

所有视觉元素必须具体说明:

主体:

是什么?

在哪里?

占多少比例?

什么角度?

什么光线?

辅助元素:

如何强化品牌?

如何辅助阅读?

装饰元素:

线条

纹理

图形

渐变

品牌符号

====================

九、生图提示词编译要求

最终输出两个部分:

【正面生图提示词】

【反面生图提示词】

每条提示词必须包含:

- 横向展开三折页
- 尺寸规格
- 页面身份
- 整体视觉策略
- 参考图设计语言
- 具体版式结构
- 图片内容
- 图片比例
- 文案区域
- 字体层级
- 色彩体系和分别占比
- 装饰元素
- 留白区域
提示词必须像设计执行稿。

总提示词字数要超过2500字。

禁止输出:

设计分析

设计说明

样机

折叠效果

手持效果

桌面效果

透视效果

水印

乱码文字

错误Logo

错误二维码

只输出可以直接用于AI生成三折页展开平面设计的完整提示词。`

/** 线路一第一步: 让视觉模型读取参考图, 只提炼设计规律(给后续纯文本模型使用) */
export function buildRepVisionPrompt(specText: string, sideLabel: string): string {
  return `这是一张商业折页${sideLabel}展开设计稿的参考图, 规格: ${specText}。
请只做设计规律分析, 不要写文案、不要生成提示词, 输出一份结构化中文分析报告, 包含:
1. 整体视觉策略(品牌气质、商业定位、情绪氛围);
2. 版式结构(主视觉位置与占比、图片/文字/留白比例、网格与对齐、信息排列逻辑、是否有跨折面连续背景/色块/曲线/装饰带);
3. 页面节奏(哪些区域视觉冲击最强、哪些承担说明、阅读顺序);
4. 图文关系(是否满版、裁切、穿插、图片作背景、空间关系);
5. 字体与信息层级(标题大小关系、字体气质、标题位置、正文密度、数据展示);
6. 装饰语言(色块、线条、图形图标、材质纹理、渐变、品牌符号);
7. 主色、辅助色、点缀色及其大致占比;
8. 可直接迁移到新项目的具体设计方法清单。
报告要具体、可执行, 供另一位设计师(看不到这张图)完整复刻其设计方法。`
}

export interface RepDirectorInput {
  foldType: FoldType
  triFold: TriFoldMode
  frontAnalysis: string
  backAnalysis: string
  frontPanels: string[]
  backPanels: string[]
  hasLogo: boolean
  hasQr: boolean
}

/** 线路一第二步: 把视觉分析报告 + 六折面文案 + 素材说明组装给整合模型 */
export function buildRepDirectorUserText(input: RepDirectorInput): string {
  const { foldType, triFold } = input
  const specText = foldSpecText(foldType, triFold)
  const foldLabel = FOLD_TYPE_LABELS[foldType]
  const triLabel = TRI_FOLD_LABELS[triFold]
  const frontRoles = foldPanelRoles(foldType, triFold, 'front')
  const backRoles = foldPanelRoles(foldType, triFold, 'back')

  const renderPanels = (label: string, roles: string[], panels: string[]) =>
    `${label}(从左到右折面身份: ${roles.join('、')}):\n` +
    roles.map((r, i) => `${i + 1}. 【${r}】${panels[i]?.trim() || '(用户未填写, 作为留白/视觉区域处理, 不得虚构文案)'}`).join('\n')

  const assets: string[] = []
  const foldName = foldType === 'tri' ? foldLabel + '(' + triLabel + ')' : foldLabel
  assets.push(`折页类型: ${foldName}; ${specText}`)
  assets.push(input.hasLogo ? '- 用户提供了品牌 Logo 素材: 按品牌规范安排在封面/封底的合适位置, 不得重绘或变形' : '- 用户未提供 Logo: 提示词中不要安排 Logo 图形, 预留简洁品牌位即可')
  assets.push(input.hasQr ? '- 用户提供了二维码素材: 安排在封底等功能信息区, 保持完整清晰、不被裁切, 不得重新绘制' : '- 用户未提供二维码: 不要虚构二维码图案')

  return [
    `【规格与素材】\n${assets.join('\n')}`,
    `【风格参考图设计规律报告 · 正面】\n${input.frontAnalysis}`,
    `【风格参考图设计规律报告 · 反面】\n${input.backAnalysis || '(背面未单独提供, 复用正面参考图, 反面必须与正面保持同一套视觉语言)'}`,
    `【正面文案】\n${renderPanels('正面各折面', frontRoles, input.frontPanels)}`,
    `【反面文案】\n${renderPanels('反面各折面', backRoles, input.backPanels)}`,
    `请严格按系统约定, 基于以上四类输入模拟真实品牌设计流程, 编译两条完整的可直接生图的中文提示词。只输出:
【正面生图提示词】
(正文)
【反面生图提示词】
(正文)
不要输出分析过程、设计说明或任何额外文字; 折面一律使用真实页面身份, 不得出现 A-F 或页码序列号。`,
  ].join('\n\n')
}

const REP_FRONT_MARK = /【?\s*正面生图提示词\s*】?/
const REP_BACK_MARK = /【?\s*反面生图提示词\s*】?/

/** 从整合模型的整段输出中切出正面 / 反面两条提示词 */
export function parseRepDirectorOutput(raw: string): { front: string; back: string } | null {
  const text = raw.trim()
  if (!text) return null
  const frontMatch = REP_FRONT_MARK.exec(text)
  const backMatch = REP_BACK_MARK.exec(text)
  if (frontMatch && backMatch && backMatch.index > frontMatch.index) {
    return {
      front: text.slice(frontMatch.index + frontMatch[0].length, backMatch.index).trim(),
      back: text.slice(backMatch.index + backMatch[0].length).trim(),
    }
  }
  // 模型只给了一段正文时, 整段作为正面, 反面留空(界面提示重新分析)
  if (frontMatch || backMatch || /正面|反面/.test(text)) return { front: text, back: '' }
  return null
}

/** 折面输入框的完整身份标签, 如「正面 A（包心折：折入页 / Z 字折：封底）」 */
export function repPanelLabel(foldType: FoldType, triFold: TriFoldMode, side: 'front' | 'back', idx: number): string {
  const letter = String.fromCharCode(65 + idx)
  const sideCn = side === 'front' ? '正面' : '反面'
  if (foldType === 'bi') {
    const roles = foldPanelRoles('bi', triFold, side)
    return `${sideCn} ${letter}（${roles[idx] ?? `折面${idx + 1}`}）`
  }
  if (side === 'back') {
    const roles = foldPanelRoles('tri', triFold, 'back')
    return `${sideCn} ${letter}（${roles[idx] ?? `内页${['一', '二', '三'][idx] ?? idx + 1}`}）`
  }
  if (idx === 2) return '正面 C（封面）'
  if (idx === 0) return '正面 A（包心折：折入页 / Z 字折：封底）'
  return '正面 B（包心折：封底 / Z 字折：折入页）'
}
