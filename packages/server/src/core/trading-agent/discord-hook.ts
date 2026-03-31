import type { TradeNotification, OrderEventNotification } from './types'

function getWebhookUrl(): string | undefined {
  return process.env.DISCORD_TRADING_WEBHOOK_URL
}

async function postWebhook(body: Record<string, unknown>): Promise<void> {
  const url = getWebhookUrl()
  if (!url) return

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // Fire and forget — never throw
  }
}

export async function notifyTrade(trade: TradeNotification): Promise<void> {
  const color = trade.side === 'buy' ? 0x10b981 : 0xef4444 // emerald : red
  const emoji = trade.side === 'buy' ? '📈' : '📉'

  await postWebhook({
    embeds: [{
      title: `${emoji} ${trade.side.toUpperCase()} ${trade.symbol}`,
      color,
      fields: [
        { name: 'Qty', value: String(trade.qty), inline: true },
        { name: 'Price', value: trade.price != null ? `$${trade.price}` : 'pending', inline: true },
        { name: 'Reasoning', value: trade.reasoning.slice(0, 1024) },
      ],
      timestamp: new Date().toISOString(),
    }],
  })
}

export async function notifyError(message: string): Promise<void> {
  await postWebhook({
    embeds: [{
      title: '⚠️ Trading Agent Error',
      description: message.slice(0, 2048),
      color: 0xff0000,
      timestamp: new Date().toISOString(),
    }],
  })
}

const EVENT_LABELS: Record<string, { label: string; color: number }> = {
  new: { label: '下单', color: 0x3b82f6 },
  accepted: { label: '下单', color: 0x3b82f6 },
  fill: { label: '成交', color: 0x10b981 },
  partial_fill: { label: '部分成交', color: 0xf59e0b },
  canceled: { label: '取消', color: 0x6b7280 },
  expired: { label: '过期', color: 0x6b7280 },
  rejected: { label: '拒绝', color: 0xef4444 },
}

function formatOrderDescription(n: OrderEventNotification): string {
  const price = n.limitPrice != null ? ` @ $${n.limitPrice}` : ''
  const tif = n.timeInForce ? ` (${n.timeInForce})` : ''
  const filled = n.filledAvgPrice != null ? ` filled @ $${n.filledAvgPrice}` : ''
  const partial =
    n.filledQty != null && n.filledQty < n.qty ? ` ${n.filledQty}/${n.qty}` : ` ${n.qty}`

  return `${n.symbol} ${n.type} ${n.side}${partial}${price}${filled}${tif}`
}

export async function notifyOrderEvent(n: OrderEventNotification): Promise<void> {
  const { label, color } = EVENT_LABELS[n.event] ?? { label: n.event, color: 0x6b7280 }

  await postWebhook({
    embeds: [
      {
        title: `[${label}] ${formatOrderDescription(n)}`,
        color,
        timestamp: new Date().toISOString(),
      },
    ],
  })
}
