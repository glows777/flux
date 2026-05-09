# Prompt Cache Chat Flow 验收清单

> 验收标准: **C - server-only mandatory + web UI smoke**
>
> 目标: 用真实 Anthropic provider 验证 prompt cache 在完整 chat 流程中实际生效，而不是只验证本地 mock、单元测试或静态 cache plan。

---

## 1. 验收结论

只有同时满足以下条件，才能判定 prompt cache 验收通过：

- server-only verifier 退出码为 `0`
- 第一轮真实 chat 观察到 cache write 证据
- 第二轮同 session chat 观察到 cache read 证据
- 两轮稳定 prefix 一致，并达到当前 model 的最小 cacheable token 阈值
- 两轮 context manifest 都存在，且能证明实际请求走过 cache-shaped provider request
- web UI smoke 不破坏完整 chat 流程

如果缺少 `ANTHROPIC_API_KEY`、无法访问真实 provider、manifest 缺失、只有 write 没有 read、或证据无法区分 read/write，都不能算通过。

---

## 2. 环境前置条件

- [ ] 当前分支为 prompt cache 验证分支，例如 `codex/verify-prompt-cache-chat-flow`
- [ ] `ANTHROPIC_API_KEY` 已配置，并且可用于真实 Anthropic 请求
- [ ] server 使用真实数据库，不使用 mock provider 或测试替身
- [ ] prompt cache rollout/gate 处于 enabled 状态
- [ ] server 端口可访问，默认 `http://localhost:3001`
- [ ] 验收脚本使用真实 `/api/chat` 和 message context API

推荐启动 server：

```bash
cd packages/server
DATABASE_URL='postgresql://flux_user:flux_password@localhost:5433/flux_test?schema=public' \
MAIN_MODEL='~anthropic/claude-sonnet-latest' \
bun run dev
```

如果 server 不在默认地址，通过环境变量覆盖：

```bash
MAIN_MODEL='~anthropic/claude-sonnet-latest' \
SERVER_URL='http://localhost:3001' bun run verify:prompt-cache-chat-flow
```

---

## 3. Server-only 硬验收

执行：

```bash
cd packages/server
MAIN_MODEL='~anthropic/claude-sonnet-latest' bun run verify:prompt-cache-chat-flow
```

验收项：

- [ ] 第一轮 `POST /api/chat` streaming 完整结束
- [ ] 第一轮 assistant message 成功持久化
- [ ] 第一轮 assistant message 的 context manifest 可读取
- [ ] 第一轮 manifest 中 `rolloutGateStatus` 为 `enabled`
- [ ] 第一轮 manifest 中 `cacheExpected` 为 `true`
- [ ] 第一轮 manifest 中存在 cache write evidence
- [ ] 第一轮 write evidence 来源清晰，来自 normalized usage 或 Anthropic raw provider metadata
- [ ] 第二轮复用同一个 session
- [ ] 第二轮请求携带第一轮后的完整 `UIMessage` history
- [ ] 第二轮 `POST /api/chat` streaming 完整结束
- [ ] 第二轮 assistant message 成功持久化
- [ ] 第二轮 assistant message 的 context manifest 可读取
- [ ] 第二轮 manifest 中 `rolloutGateStatus` 为 `enabled`
- [ ] 第二轮 manifest 中 `cacheExpected` 为 `true`
- [ ] 第二轮 manifest 中存在 cache read evidence
- [ ] 第二轮 read evidence 来源清晰，来自 normalized usage 或 Anthropic raw provider metadata
- [ ] 两轮 `provider` 一致
- [ ] 两轮 `modelId` 一致
- [ ] 两轮 `preparedCacheRequest` 为 `true`
- [ ] 两轮 `usedCacheRequest` 为 `true`
- [ ] 两轮没有因为 circuit breaker、fallback 或 gate disabled 绕过 cache path

---

## 4. Prefix 稳定性验收

两轮 manifest 必须满足：

- [ ] `systemHash` 一致
- [ ] `memoryHash` 一致
- [ ] `toolDefinitionsHash` 一致
- [ ] `effectivePrefixSegmentIds` 一致
- [ ] `effectivePrefixEstimatedTokens >= minCacheablePrefixTokens`
- [ ] `minCacheablePrefixTokens` 按实际 Anthropic model 计算，而不是写死通用阈值

说明：

- `dynamicTailHash` 可以不同，只作为报告项，不作为失败条件
- 如果稳定 prefix hash 不一致，即使第二轮 streaming 成功，也不能证明 prompt cache 命中的是预期前缀
- 如果 prefix token 数低于 model 阈值，不能把未命中归因于实现正确

---

## 5. Provider Request 观测验收

manifest 必须能证明实际 provider request 是 cache-shaped request：

- [ ] 记录 `modelRequest.provider`
- [ ] 记录 `modelRequest.modelId`
- [ ] 记录 `modelRequest.preparedCacheRequest`
- [ ] 记录 `modelRequest.usedCacheRequest`
- [ ] 记录 provider messages 摘要
- [ ] 记录 message-level cache-control breakpoint 数量
- [ ] 记录 tool-level cache-control breakpoint 数量
- [ ] 记录 cached tool names 或 cached tool count

注意：manifest 不需要保存完整用户内容，但必须保存足够的结构化摘要，用来判断 cache-control 是否真的被放入 provider request。

---

## 6. Web UI Smoke 验收

Web UI smoke 是补充验收，不替代 server-only verifier。

启动 web 后执行：

```bash
cd packages/web
NEXT_PUBLIC_SERVER_URL='http://localhost:3001' bun run dev
```

手动检查：

- [ ] 在 web UI 中打开 chat
- [ ] 新建或进入一个 session
- [ ] 发送第一条消息
- [ ] assistant 流式回复完整显示
- [ ] 同一个 session 中继续发送第二条消息
- [ ] 第二轮 assistant 流式回复完整显示
- [ ] UI 不丢消息
- [ ] UI 不重复消息
- [ ] UI 不破坏 session 续接
- [ ] message context detail 能打开，且能看到对应 assistant message 的 context 信息

通过标准：

- web UI smoke 只证明前端完整聊天流程没有断
- prompt cache 是否实际生效，以 server-only verifier 的 read/write evidence 为准

---

## 7. 明确不通过的情况

以下任一情况出现，都不能判定验收通过：

- [ ] 缺少 `ANTHROPIC_API_KEY`
- [ ] 使用 mock provider 或 mock metadata
- [ ] 只有单元测试通过，没有跑真实 `/api/chat`
- [ ] 只有第一轮 cache write，没有第二轮 cache read
- [ ] 只有 `cacheObserved: true`，但无法区分 read/write
- [ ] streaming 成功，但 assistant message 未持久化
- [ ] assistant message 已持久化，但 context manifest 缺失
- [ ] manifest 中没有实际 provider request 摘要
- [ ] rollout gate 不是 `enabled`
- [ ] cache path 被 circuit breaker、fallback 或 gate disabled 绕过
- [ ] provider/model 在两轮之间变化
- [ ] 稳定 prefix hash 不一致
- [ ] prefix token 数低于当前 model 的 cacheable 阈值
- [ ] verifier 输出 inconclusive
- [ ] verifier 退出码非 `0`

---

## 8. 验收记录模板

```md
## Prompt Cache 验收记录

- 日期:
- 分支:
- server URL:
- provider:
- modelId:
- verifier 命令:
- verifier 结果:
- 第一轮 write evidence:
- 第二轮 read evidence:
- stable prefix hashes:
- prefix estimated tokens:
- min cacheable prefix tokens:
- web UI smoke 结果:
- 结论: 通过 / 不通过
- 备注:
```

---

## 9. 清理要求

如果验收过程中启动了本地服务，结束后检查并关闭：

- [ ] server 端口 `3001`
- [ ] web 端口 `3000`

```bash
lsof -i :3000 -i :3001
```
