# Verify Third-Party API/Library Before Planning

**Extracted:** 2026-02-12
**Context:** Any task involving third-party APIs or libraries

## Problem

在规划阶段，如果不查阅第三方 API/库的最新文档就直接设计方案，容易基于错误假设写出有 bug 的代码。

真实案例：FMP income-statement API 返回了 `fiscalYear` 和 `filingDate` 字段，但设计时未查阅完整响应结构，
Zod schema 用 `.strip()` 丢弃了这些字段，代码被迫用 `date.slice(0, 4)` 推导年份。
对 NVDA 等非日历财年公司，`date` 年份与 `fiscalYear` 不一致，导致季度数据全部错配。

## Solution

**在 Plan 阶段，凡涉及第三方 API/库，必须先查文档再设计：**

1. 使用 `context7` (resolve-library-id → query-docs) 查询库的最新用法和类型定义
2. 若 context7 无结果，使用 `WebSearch` / `WebFetch` 查阅官方文档
3. 对 REST API，确认实际响应的完整字段列表（不要只看"我需要的字段"）
4. 将查到的字段/类型写入 plan，作为 schema 设计的依据
5. 不要基于字段名"猜测"含义（如 `date` ≠ filing date，而是 period end date）

## When to Use

- EnterPlanMode 后，plan 涉及调用第三方 API 或使用第三方库
- 设计 Zod schema / TypeScript 类型时
- 对已有的第三方集成做修改或扩展时
- 任何"我觉得这个字段应该是…"的直觉判断出现时 → 停下来查文档
