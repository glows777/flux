import type { StoreDeps } from './store'
import { getSlotContent } from './store'
import type { MemorySlot } from './types'

// ─── Types ───

export interface LoaderDeps extends StoreDeps {}

// ─── trading-agent 注入的 slot 列表（auto-trading-agent 不走 loader）───

const TRADING_AGENT_SLOTS: MemorySlot[] = [
    'user_profile',
    'portfolio_thesis',
    'market_views',
    'active_focus',
    'lessons',
]

const SLOT_SECTION_TITLES: Record<MemorySlot, string> = {
    user_profile: '用户档案',
    portfolio_thesis: '持仓论点',
    market_views: '市场观点',
    active_focus: '当前关注',
    lessons: '交易教训',
    agent_strategy: '自主策略',
}

// ─── Exported ───

/**
 * 为 trading-agent 加载 memory context。
 * auto-trading-agent 不调用此函数，通过工具自取。
 */
export async function loadMemoryContext(deps?: LoaderDeps): Promise<string> {
    const results = await Promise.all(
        TRADING_AGENT_SLOTS.map(async (slot) => {
            const content = await getSlotContent(slot, deps)
            return { slot, content }
        }),
    )

    const sections = results
        .filter(
            (r): r is { slot: MemorySlot; content: string } =>
                r.content !== null,
        )
        .map(
            ({ slot, content }) =>
                `## ${SLOT_SECTION_TITLES[slot]}\n${content}`,
        )

    return sections.join('\n\n')
}
