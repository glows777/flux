/**
 * Shared utility functions for holding components
 */

export function pnlColor(value: number): string {
    if (value > 0) return 'text-emerald-400'
    if (value < 0) return 'text-rose-400'
    return 'text-slate-400'
}

export function computePnLPercent(holding: {
    readonly shares: number
    readonly avgCost: number
    readonly totalPnL: number
}): number {
    const costBasis = holding.shares * holding.avgCost
    if (costBasis === 0) return 0
    return (holding.totalPnL / costBasis) * 100
}
