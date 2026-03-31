import type { PortfolioSummary } from '@flux/shared'
import { formatCurrency, formatPercent, formatSignedCurrency, getVixLabel } from '@flux/shared'
import { StatCard } from './StatCard'

interface StatsGridProps {
    data: PortfolioSummary | null
}

function getSubColor(value: number): 'emerald' | 'rose' | 'slate' {
    if (value > 0) return 'emerald'
    if (value < 0) return 'rose'
    return 'slate'
}

function getTopContributorSub(
    summary: PortfolioSummary,
): { text: string; color: 'emerald' | 'rose' | 'slate' } {
    if (!summary.topContributor) {
        return { text: '添加持仓开始追踪', color: 'slate' }
    }

    const { symbol, name, dailyPnL } = summary.topContributor
    return {
        text: `主要收益来自${name ?? symbol}`,
        color: getSubColor(dailyPnL),
    }
}

export function StatsGrid({ data }: StatsGridProps) {
    const summary = data ?? {
        totalValue: 0, totalCost: 0, totalPnL: 0, totalPnLPercent: 0,
        todayPnL: 0, todayPnLPercent: 0, topContributor: null, vix: 0,
    }

    const pnLSub = getTopContributorSub(summary)
    const vixLabel = getVixLabel(summary.vix)

    return (
        <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
            <StatCard
                label='总资产组合'
                value={formatCurrency(summary.totalValue)}
                sub={`今日 ${formatPercent(summary.todayPnLPercent)}`}
                subColor={getSubColor(summary.todayPnLPercent)}
                sub2={`总盈亏 ${formatSignedCurrency(summary.totalPnL)} (${formatPercent(summary.totalPnLPercent)})`}
                sub2Color={getSubColor(summary.totalPnL)}
                active
            />
            <StatCard
                label='今日盈亏'
                value={formatSignedCurrency(summary.todayPnL)}
                sub={pnLSub.text}
                subColor={pnLSub.color}
            />
            <StatCard
                label='Flux 风险评分'
                value={`${Math.round(summary.vix)}/100`}
                sub={vixLabel}
            />
        </div>
    )
}
