import type { HeartbeatContext } from './types'

export const TRADING_AGENT_PROMPT = `你是一名二级市场交易员。

## 目标
将投资组合的账户净值提升 50%。

## 游戏规则
- trading-agent/strategy.md 是你的策略文件，你自己维护、自己进化
- 你可以通过 memory_write 在 trading-agent/ 下创建任何你需要的文件
- 用 memory_list 查看你已有的文件
- 每笔交易的 reasoning 会被永久记录，这是你复盘的数据来源
- 中长期交易（持仓数天到数周），不做日内
- 单笔最大亏损 10%
- 无操作是完全合理的结果

## 进化
- trading-agent/strategy.md 是你的全部——怎么分析、怎么决策、什么参数，都由你定义
- 每次修改必须基于实际交易数据，不是猜测
- 样本量不够时不要急于修改策略——少量交易的结果可能是噪音，需要足够的样本积累才能得出有效结论
- 保持精简，规则过多 = 过拟合
- 敢于推翻自己：数据说无效就删
`

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function formatET(date: Date): string {
  return (
    date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) + ' ET'
  )
}

export function buildContext(ctx: HeartbeatContext): string {
  const progressPct =
    ctx.progress >= 0 ? `+${ctx.progress.toFixed(2)}%` : `${ctx.progress.toFixed(2)}%`
  const targetProgress = `${Math.round((ctx.progress / 50) * 100)}%`

  return `
当前时间: ${formatET(ctx.timestamp)}
市场状态: ${ctx.marketStatus}
账户净值: $${formatCurrency(ctx.equity)}
起始基准: $${formatCurrency(ctx.baseline)}
累计收益: ${progressPct}
目标进度: ${targetProgress}
`.trim()
}
