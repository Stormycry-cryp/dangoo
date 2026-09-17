# Codex 机制复用记录

本工程按 Codex 源码中的机制独立改写 TypeScript 实现。当前没有直接复制 Rust 函数，也没有调用 Codex CLI、App Server、账号服务或状态目录。不得将这份机制对应表解释为已经完成 Codex 全部行为的等价移植。

参考快照：`openai/codex@1f0566d3f59298d1bb88820a0d35294f1eeb07ea`。本机源码位于 `/Users/chenyunzhe/Documents/Codex_Project/Codex/codex`；构建与运行不读取这个路径。Apache-2.0 许可文本附于 `third_party/CODEX-LICENSE`，后续直接复制代码时须同步保留源文件版权与适用 NOTICE。

| Codex 路径（相对 codex-rs） | 采用机制 | 本工程位置 |
| --- | --- | --- |
| core/src/session/turn.rs | 持续模型与工具往返、turn 生命周期、取消、恢复 | src/core |
| core/src/tools/registry.rs、router.rs、parallel.rs | 注册与 schema、revision快照、安全并行、路由与结果关联 | src/core/tool-* |
| core-skills/src/service.rs、loader.rs、injection.rs、render.rs | 作用域、发现、缓存失效、渐进加载与版本固定 | src/skills |
| model-provider/src、codex-api/src/sse、core/src/responses_retry.rs | Provider 分层、流式解析、凭证注入、错误分类和重试 | src/providers |
| core/src/context_manager/history.rs、normalize.rs | 类型化历史、调用结果配对、预算、上下文增量 | src/context |
| core/src/compact.rs、compact_token_budget.rs | 安全边界压缩、摘要版本、重注入、失败保留原状态 | src/context |
| rollout、protocol | 持久事件、关联ID、恢复检查点 | src/core/store.ts |

选择 TS 是为了让独立服务、Provider、业务桥接与前端契约共用类型，并避免复制 Rust core 的通用终端、登录、沙箱等依赖闭包。完整性以本工程行为验收为准，不以源码行数或语言判断。SQLite 与少量直接依赖承担持久化、schema 和解析；不引入通用 Agent 框架。

有意没有移植的产品外围：通用 shell、代码执行、浏览器自动化、多 Agent 调度、MCP 市场、终端 UI、Codex 登录与遥测。它们不在当前画布创作首版范围。

GLM 接入参考：官方 [HTTP API 说明](https://docs.bigmodel.cn/cn/api/introduction) 提供通用端点；[GLM-5.3-Flash 发布说明](https://autoclaw.z.ai/blog/model/glm-5.3-flash/) 确认该模型发布及多模态能力。2026-09-16 已用用户提供的凭证验证 `glm-5.3-flash` 流式工具调用，并通过 UI 完成真实画布节点创建和回读。账户上下文限额与多模态 tool 往返仍需专项联调。代码采用用户指定模型名，并允许独立覆盖端点、能力与预算，不静默改成其他模型。
