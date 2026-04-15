'use client'

interface ComparisonTableProps {
    readonly data: {
        readonly title?: string
        readonly rows: readonly {
            readonly metric: string
            readonly values: readonly {
                readonly symbol: string
                readonly value: string
                readonly highlight?: 'positive' | 'negative' | 'neutral'
            }[]
        }[]
    }
}

const HIGHLIGHT_COLORS: Record<string, string> = {
    positive: 'text-emerald-400',
    negative: 'text-red-400',
    neutral: 'text-slate-300',
}

export function ComparisonTable({ data }: ComparisonTableProps) {
    if (data.rows.length === 0) return null

    // 从第一行提取所有 symbol
    const symbols = data.rows[0]?.values.map((v) => v.symbol) ?? []

    return (
        <div className='my-3 rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden'>
            {data.title && (
                <div className='px-4 py-2 border-b border-white/5 text-xs text-slate-400'>
                    {data.title}
                </div>
            )}
            <table className='w-full text-xs'>
                <thead>
                    <tr className='border-b border-white/5'>
                        <th className='px-4 py-2 text-left text-slate-500 font-normal'>
                            指标
                        </th>
                        {symbols.map((symbol) => (
                            <th
                                key={symbol}
                                className='px-4 py-2 text-right text-slate-400 font-medium'
                            >
                                {symbol}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.rows.map((row) => (
                        <tr
                            key={row.metric}
                            className='border-b border-white/5 last:border-b-0'
                        >
                            <td className='px-4 py-2 text-slate-400'>
                                {row.metric}
                            </td>
                            {row.values.map((cell) => (
                                <td
                                    key={`${row.metric}-${cell.symbol}`}
                                    className={`px-4 py-2 text-right ${HIGHLIGHT_COLORS[cell.highlight ?? 'neutral'] ?? 'text-slate-300'}`}
                                >
                                    {cell.value}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
