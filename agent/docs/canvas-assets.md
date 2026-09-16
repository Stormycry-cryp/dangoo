# 画布资产实现建议

版本：0.1 · 2026-09-16  
适用：Dangoo `d5e72ad1` 与独立 `dangoo-agent` 接入契约 `1.0.0`

## 1. 推荐方案

将资产做成画布业务系统的一项独立能力。画布、手动上传、节点生成和 Agent 共用资产身份、权限、版本及存储入口。Agent 通过 `search → get → view → resolve` 逐步读取素材；聊天数据库只保存引用和使用关系。先使用现有 PocketBase/SQLite 与媒体存储，不引入向量库，也不复制文件到 Agent 数据库。

首批实施应交付：稳定资产 ID、不可变内容版本、归属与画布关联、生成结果自动登记、Agent 检索/查看/引用接口、后台补偿任务。随后把现有全局资产、项目素材、图片组与工作流 UI 逐步切换到这些接口。

当前实现已经准备 `AssetGateway`、`AssetRecord`、`AssetRef`、`AssetAccess`、HTTP 桥接客户端及 `asset_search / asset_get / asset_view`。默认未接入时返回 `ASSET_INTEGRATION_UNAVAILABLE`，不返回空库假象；本文件中的数据库、生产接口和迁移是待业务系统实施的建议，尚未运行迁移。

## 2. 当前系统如何承接

| 当前内容 | 代码事实 | 承接方式 |
| --- | --- | --- |
| 全局资产 | `AssetItem` 有 id/name/url/media_type/source/width/height/folder/images | 原记录保留，建立 legacy 映射，再转为逻辑资产与集合 |
| 项目素材 | `CanvasDoc.projectAssets` 内嵌保存；分组成员以 URL 表达 | 转成画布关联记录；读取兼容期间仍能读取旧字段 |
| 文件 | `media_files` 存储，部分 RunningHub URL 需中转与持久化 | 文件对象登记来源与稳定 storageKey，签名地址按使用时签发 |
| 生成结果 | 节点有 `results[]`、remote task ID，先显示远端 URL 后异步转存 | 建立 job output 与 asset version 关系，转存状态单独记录 |
| 工作流 | 结构在资产数据的 `images` 等复用字段中保存 | 独立工作流模板实体，不当成媒体文件 |
| 图片组 | 多个 URL 作为成员 | 改成有顺序的集合成员 `(assetId, version)` |
| 权限 | 当前 hook 使用已验证 `authEmail` 与 `rh_user_id` | 业务服务将已认证主体映射为 owner；不接受模型提供 owner |

以上基于 `dangoo/src/pages/Canvas/canvasTypes.ts`、`useCanvas.ts`、`pocketbase/pb_hooks/assets.pb.js`、`media.pb.js`。不直接修改旧数据来凑出新契约；迁移期间新旧身份应能查到彼此。

## 3. 身份与版本规则

### 3.1 四种对象分开

- **逻辑资产 asset**：用户能够重命名、收藏、移动或删除的素材。稳定 `assetId`。
- **内容版本 asset_version**：一次确定的媒体内容。`assetId + version` 永久标识相同字节与衍生信息。
- **物理文件 media_object**：实际存储对象，可能被多个内容版本引用。资产权限不由文件是否去重决定。
- **集合 collection / 工作流 workflow**：有顺序的组织方式与节点模板，分别有自己的身份。

节点是作品中的一个位置和处理单元，同一资产能放到多个节点。节点 ID 不成为资产 ID，URL 也不成为身份。

### 3.2 哪些操作产生新身份

| 操作 | 身份变化 |
| --- | --- |
| 上传一个文件 | 新 assetId，version=1；即使文件字节相同也可有不同逻辑用途 |
| 生图、图改图、裁剪、融合、放大 | 新 assetId/version=1，记录 parents 与变换信息 |
| 明确“替换这个素材的文件” | 保留 assetId，version+1；保留旧内容供历史任务引用 |
| 改名、标签、描述、收藏 | version 不变，metadataRevision+1 |
| 放入另一画布、集合 | 增加关联，不复制内容 |
| 选择一个生成候选 | 更新节点的 selectedAssetRef；保留其他候选 |
| 下载 | 不生成新资产 |

Agent、节点执行快照和聊天消息都引用固定版本。UI 可以显示“已有新版”，但不会在历史调用中把 `a@1` 偷换成 `a@2`。

### 3.3 版本不可变的边界

文件替换后旧版本的 storageKey、hash、mediaType、宽高和变换记录不可变。生成中的资产版本可以从 `pending` 变为 `stored`，但只允许补齐同一任务承诺的那份内容；完成后禁止改写。内容确实改变时必须创建新版本。metadataRevision 用于乐观锁和缓存失效，不能用于锁定图片内容。

## 4. 数据结构

以下 SQL 是概念模型，可映射为 PocketBase collections + migration。真实迁移应按当前 PB 版本验证字段类型、事务 API 和索引，不直接把它当成已验收迁移脚本。

```sql
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  media_type TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  metadata_revision INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  description_source TEXT, -- user/model/import; 模型描述有 provenance
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX assets_owner_time ON assets(owner_id, created_at DESC, id DESC);
CREATE INDEX assets_owner_type ON assets(owner_id, media_type, created_at DESC);

CREATE TABLE media_objects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  storage_backend TEXT NOT NULL,
  storage_key TEXT,
  sha256 TEXT,
  mime_type TEXT,
  byte_size INTEGER,
  state TEXT NOT NULL, -- pending/stored/failed/quarantined
  created_at INTEGER NOT NULL,
  UNIQUE(owner_id, storage_backend, storage_key)
);
CREATE TABLE asset_versions (
  asset_id TEXT NOT NULL REFERENCES assets(id),
  version INTEGER NOT NULL,
  object_id TEXT REFERENCES media_objects(id),
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  source_job_id TEXT,
  output_index INTEGER,
  transform_json TEXT,
  storage_state TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(asset_id, version)
);
CREATE UNIQUE INDEX asset_job_output ON asset_versions(source_job_id, output_index)
  WHERE source_job_id IS NOT NULL;

CREATE TABLE asset_relations (
  child_asset_id TEXT NOT NULL,
  child_version INTEGER NOT NULL,
  parent_asset_id TEXT NOT NULL,
  parent_version INTEGER NOT NULL,
  relation TEXT NOT NULL, -- edit_source/reference/variant_of/frame_of/mask_of
  ordinal INTEGER NOT NULL,
  PRIMARY KEY(child_asset_id, child_version, relation, ordinal)
);
CREATE TABLE canvas_assets (
  canvas_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  added_by TEXT NOT NULL,
  PRIMARY KEY(canvas_id, asset_id)
);
CREATE TABLE asset_collections (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  canvas_id TEXT, -- null 表示账户范围
  name TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE asset_collection_items (
  collection_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY(collection_id, ordinal)
);
CREATE TABLE asset_legacy_map (
  owner_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_key TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  PRIMARY KEY(owner_id, source_kind, source_key)
);
```

生产补充约束：所有 version 引用应有复合外键或业务事务校验；job output 的唯一键应包含上游明确的 provider/account 命名空间，避免不同供应商 ID 撞号；deleted_at 状态不能被只查版本表绕过；外部对象存储与数据库不能假装一个事务，应采用 outbox/补偿流程。

不建议把全部 tags、lineage、所有历史结果塞进 CanvasDoc。画布保存节点位置、连接和固定引用即可；复杂元数据按需读。

## 5. API 契约

业务桥接基址建议 `/api/agent-bridge/v1`。Agent 先握手读取 `contractVersion/capabilitiesRevision/assets/operations/jobs`。次版本添加字段，主版本改变语义；未知能力不向模型发布。

| 方法与路径 | 职责 |
| --- | --- |
| GET `/capabilities` | 契约、能力版本、节点目录、支持的媒体类型 |
| POST `/canvases/:id/assets/search` | 授权范围内分页检索 |
| GET `/canvases/:id/assets/:assetId/versions/:version` | 元数据和 lineage 摘要 |
| POST `/canvases/:id/assets/:assetId/versions/:version/access` | 签发指定用途访问资料 |
| POST `/assets/uploads` | 建立上传会话与幂等请求 |
| POST `/assets/uploads/:uploadId/complete` | 核对文件并登记资产 |
| PATCH `/assets/:assetId/metadata` | metadataRevision 乐观锁更新 |
| POST `/canvases/:id/assets/attach` | 把已有授权资产关联到画布 |
| POST `/jobs/:jobId/outputs/register` | 业务内部调用，幂等登记产物 |
| GET `/operations/:operationId` | 核对已提交请求，不重新发起生成 |

### 5.1 检索

```json
{
  "query": "白底 产品",
  "scope": "canvas",
  "mediaType": "image",
  "limit": 20,
  "cursor": null
}
```

```json
{
  "items": [{
    "assetId": "ast_01",
    "version": 1,
    "metadataRevision": 3,
    "name": "瓶身白底候选 2",
    "mediaType": "image",
    "source": "generation",
    "width": 1536,
    "height": 2048,
    "description": "透明瓶身，浅灰阴影",
    "tags": ["白底"],
    "createdAt": 1789527600000,
    "parents": [{"assetId": "ast_source", "version": 1}],
    "storageState": "stored"
  }],
  "nextCursor": "opaque-signed-cursor"
}
```

检索返回元数据，不默认塞 URL、base64、全部 lineage 或原始提示词。使用 `(created_at,id)` 稳定降序 keyset 分页，cursor 绑定 scope/filter/sort；同一时间多条素材不能漏读或重复。首期对 name/tags/description 做 SQLite FTS 或规范化文本搜索；没有命中应返回明确空结果，权限失败与服务未接入应分别报错。向量检索有真实语义召回需求和评测后再加。

### 5.2 查看与执行引用

```json
{
  "ref": {"assetId": "ast_01", "version": 1},
  "kind": "image",
  "mimeType": "image/webp",
  "url": "https://media.example/short-lived-access",
  "expiresAt": 1789527900000
}
```

`access` 请求的 `purpose` 建议区分 `thumbnail/preview/vision/generation/download`。视觉模型需要真实图片输入；返回一段 URL 文本不等于模型看过图。缩略图可用于列表，提交编辑任务须使用固定版本的原图或明确的裁剪产物。业务后端在生成提交前重新校验 asset ref 与权限，再解析供应商可读取的 URL。不要让模型拼接域名、绕过 ACL 或把历史签名 URL 当永久引用。

Agent 的 `viewedAssets` 保存 ref；过期后重新签发 access。失权返回 `ASSET_FORBIDDEN`；删除返回 `ASSET_DELETED`；版本不存在返回 `ASSET_VERSION_NOT_FOUND`；未转存返回 `ASSET_NOT_READY`。UI 的缩略图也需要刷新策略。

### 5.3 元数据修改

```json
{
  "expectedMetadataRevision": 3,
  "name": "选定主图",
  "tags": ["春季", "已选"]
}
```

服务端事务比较 revision，再修改并自增。并发冲突返回 409 和当前 revision；Agent 重读后确认适用范围，不能自动强行覆盖用户刚刚输入的名字。

## 6. 生成结果的落库与补偿

### 6.1 顺序

1. 钱包/节点业务服务创建 durable job 与 operationId，固定输入资产版本、节点 revision、模型参数、价格授权、批次顺序。
2. 标记 `submitting` 后向生成服务提交。拿到 remoteId 后记录 `submitted`。网络中断且不知是否受理时记 `submission_unknown`，通过 operationId/provider 查询核对；不得自动重新收费提交。
3. 上游终态为成功后记录每个 output 的稳定 outputIndex；登记 pending 资产与 canvas 关联。结果顺序来自提交/返回协议，不依赖先下载完成的文件顺序。
4. outbox worker 把临时结果转存到持久文件，校验大小、媒体类型和文件可读取性，更新 object/version `stored`。
5. 用节点版本和结果槽位快照回填画布。若用户已改节点或节点被删，标记 `conflict/target_missing`，保留资产与任务结果供用户插入。
6. 发送 `job.updated/asset.ready/canvas.changed`。Agent 能分别读到三项状态，不能把“生成成功”说成“已保存并放入画布”。

### 6.2 最少状态

| 维度 | 状态 |
| --- | --- |
| 生成 | created / submitting / submitted / running / succeeded / failed / canceled / submission_unknown |
| 存储 | pending / stored / failed |
| 画布应用 | pending / applied / conflict / target_missing |

重试转存只重试下载/上传；重试回填只重试画布 apply；真正重新生成创建新的 operationId 和新的费用授权。不能用一个“重试”按钮把这三种操作混在一起。

### 6.3 幂等与原子性

`owner + operationId + action` 唯一，保存请求 hash 与结果。相同 key 相同请求回放；相同 key 不同请求返回 `IDEMPOTENCY_CONFLICT`。产物 `jobId + outputIndex` 唯一，worker 重启重复消费不会重复创建资产。画布 revision CAS、资产引用校验、关联写入和 operation receipt 在同一数据库事务中提交。外部文件完成通过 outbox 连接，不持有数据库事务等待网络上传。

## 7. 上传、导入与文件访问

上传会话记录 owner、目标画布、声明类型/大小、幂等键、过期时间。服务端检查实际 magic bytes、尺寸/时长与限额，确认文件完整后登记资产。上传断开可以恢复；只有已完整接收且通过验证的文件能标记 stored。

外部 URL 导入由专门服务执行：限制协议、重定向、内网地址、最大字节数和下载时间，避免任意抓取。普通 Agent `asset_get/view` 不接受自由 URL。模型供应商收到图片意味着文件内容将发给已配置的供应商，应沿用产品的媒体授权策略与账户设置。

对外访问只给短期用途凭证，绑定对象和用途；必要时结合 owner 授权。日志记录 assetId/version/purpose，不记录带凭证的完整 URL。哈希去重按 owner 范围起步；跨账户去重必须维持独立授权，不能通过 hash 猜出他人是否拥有某文件。

不要简单将 PB `viewRule=null` 解释成公开可读；需按项目当前 PocketBase 实际规则做未登录、他人账户、已撤销会话三个控制试验。

## 8. 创作语义

### 8.1 输入角色

引用包含 `edit_source/reference/result`。多个参考图顺序固定并保存在任务输入快照中。主体图、风格图、构图图可以增加业务层 `purpose` 字段，模型与生成 adapter 都使用相同顺序；不在每轮重新按检索结果排序。

### 8.2 局部裁剪与遮罩

局部编辑产生独立 crop 或 mask 资产，记录 parent ref、原图尺寸、像素坐标与归一化坐标、padding、变换矩阵/坐标系版本。禁止仅保存一个临时 canvas blob URL。融合结果创建新资产，保留原图与 patch 父链；UI 可回溯“从哪张图的哪个区域改出来”。

### 8.3 候选组与选择

一个生成批次映射为有序 collection。结果“第二张”由 outputIndex/collection ordinal 解释；晚到的结果不得挤到第一项导致指代变化。用户选定作品记录明确 ref，并进入 session pinned 创作上下文。其余候选继续可访问，避免多轮修改丢失比较依据。

### 8.4 工作流

工作流模板包含 schemaVersion、节点 kind/参数白名单、连接、可替换输入槽与展示缩略图 ref。剔除运行中 taskId、jobStatus、余额、用户 token 与临时 URL。实例化时生成全新 node IDs 并重写连接。资产引用需再次校验权限，缺失输入显式留空待填，不能拿模板作者私有素材直接执行。

## 9. Agent 如何读取资产

参考 FDAgent 当前实现中的两条有价值的机制：紧凑库存告知模型有哪些资产；`asset_ref` 经授权解析成真实图片输入供模型或生成工具使用。Dangoo 应补充分页、内容版本、画布关联和长任务恢复。

推荐上下文注入顺序：用户当前输入及明确选中引用 → 当前任务 pinned 约束和选择版本 → 最近少量产物索引 → 必要时检索历史。用户说“刚才第二张”时优先读上轮 batch/index，再查看真实图片；不能从文件名猜内容。

素材描述、OCR、导入 prompt 与文件名都作为不可信数据，不能覆盖系统工具权限。Skill 负责创作方法，不把所有资产元数据塞到 Skill 文件。工具输出被截断时保留 result handle，使用 `result_read` 分页回读；任何上下文压缩都保留 pinned refs、selected result、未决 job、输入顺序和未完成约束。原始历史保留在 Agent store。

## 10. 前端呈现

沿用画布现有资产入口。列表默认缩略图、短名称和必要状态；尺寸、来源、历史版本、父链放入详情。参考 Proto 的紧凑信息密度，不添加成片教学说明、开发注释或实现术语。

- 拖入画布写入固定 asset ref，节点展示当前选中版本。
- 拖入聊天形成引用小卡，可删除、预览、回到画布；发送时冻结引用。
- 结果逐项出现，转存失败仅在对应结果显示轻量状态与重试，不让整个对话红屏。
- 对话浮层与资产面板避免重叠；窄屏切换面板，画布仍有明确返回入口。
- 收藏是明确操作；生成完成默认关联当前画布，不自动把所有中间图灌满账户素材库。
- 删除先说明引用影响；本期优先软删除与恢复。被有效工作流、历史版本或任务引用的文件不立即物理清除。

## 11. 迁移方案

### 第一步：新增身份与只读对照

创建新集合、legacy map 与桥接读接口；现有 UI 仍读取旧库。离线扫描以 `(owner, sourceKind, sourceKey)` 为幂等键，产生映射报告：可迁移、缺文件、URL过期、身份冲突、权限未知。报告只做数据质量核对，不直接触发真实生成。

### 第二步：新上传与新生成双写

业务入口一次完成新资产登记，并保留旧 UI 所需兼容字段。双写错误通过 outbox 可恢复；不能在两个独立请求里假装同时成功。新 Agent 只引用新资产ID。原本只有 URL 的对象，在映射建立前不能冒充固定 ref。

### 第三步：画布渐进迁移

按单画布事务升级：保留 CanvasDoc 原版本备份，给节点/results/projectAssets 建立 asset refs，保留 URL 为兼容展示字段。兼容读取时优先 ref，无法解析才落回 legacy；发生冲突停止该画布升级，其他画布可继续。图片组顺序和工作流节点占位必须保持。

### 第四步：切换读写与收尾

在同一画布上验证手动上传、Agent检索、节点执行、结果转存、刷新、跨轮再引用均通过后切换主读。旧字段删除另行授权，直到回滚窗口结束才安排。保留 legacy map 有利于历史聊天/外部链接恢复。

### 回滚

配置关闭新入口可回到旧读取；已经产生新资产的数据不可简单撤销数据库 migration。保留映射、原文件、旧 CanvasDoc 备份与双写记录，用兼容输出恢复旧 UI 可读性。禁止把回滚解释为删除用户新作品。

## 12. 验收清单

| 场景 | 必须证明的结果 |
| --- | --- |
| 同一上传请求重复提交 | 一个逻辑产物，同一 operation receipt |
| 相同幂等键换文件 | 明确冲突，不覆盖 |
| 同图不同用途 | 可有不同逻辑资产，物理存储可去重 |
| 跨用户访问同 assetId | 读取、缩略图、原图与生成解析均拒绝 |
| 版本替换后重复旧任务 | 旧任务仍使用原 version |
| 两人同时改名称 | 一个成功一个 revision冲突 |
| 生成成功但文件转存失败 | 生成成功、存储失败分别可见；重试不重新扣生成费 |
| 响应丢失的提交 | 查询核对，不盲目再生成 |
| 服务重启处理同 output | 不重复资产/收藏/回填 |
| 节点已删或被手工修改 | 产物保留，apply冲突可恢复 |
| 多图返回乱序 | “第二张”的稳定顺序不变 |
| 签名URL过期 | 从 ref 刷新 access，不要求重新生成 |
| Compact 后继续用上张图 | 真实相同版本进入模型/生成输入 |
| 图片组迁移 | 顺序、名称、归属与成员一一对应 |
| 工作流实例化 | 新节点ID，无旧task/账号/临时凭证 |
| 中断迁移后重跑 | 根据legacy map幂等继续 |
| 资产能力关闭 | 明确 unavailable，不伪造库存为空 |

性能目标先按实际库存分布测量：20条库存回包建议低于12KB（不含缩略图）；列表不要同步签发所有原图；缩略图懒加载并限制并发；检索P95目标<300ms（本地业务查询，不含媒体网络）。这些是工程目标，尚无生产测量。日志按operationId/jobId/assetRef关联，避免整段prompt和签名URL进入常规日志。

## 13. 实施顺序与职责

1. **资产业务后端**：schema/ACL/ref resolver/上传登记/生成output outbox/访问签发。
2. **画布适配层**：节点与结果引用字段、手工和Agent共用的原子命令、冲突恢复。
3. **Agent 接入**：实现本工程 `AssetGateway`，通过握手启用能力；无需改 runtime。
4. **资产 UI**：列表切换、详情/版本/来源、引用小卡；信息密度遵循第10节。
5. **迁移与验证**：先测试副本再实际迁移；本文件不构成生产迁移或删除授权。

完整验收至少需要业务服务、媒体存储与真实生成服务联调；只通过mock或契约测试不能宣布资产链路已接通。

## 14. 参考证据

- Dangoo：`src/pages/Canvas/canvasTypes.ts`、`useCanvas.ts`、`pocketbase/pb_hooks/assets.pb.js`、`media.pb.js`、`canvases.pb.js`，基线 `d5e72ad1`。
- FDAgent：`fd-agent/vendor/fdagent-core/src/context.ts` 库存、asset_ref、viewedAssetIds；`tools.ts` view_asset；`src/tools/fd-conversation-image/executor.ts` 授权引用解析与顺序；`mysql-store.ts` 上传/产物登记。参考仓库存在未提交工作，按本次读取源码事实理解，未复制业务凭据或修改仓库。
- 本工程：`src/contracts/index.ts`、`src/adapters/{assets,http,tools}.ts`；资产接口已准备，生产实现待接入。
