'use client'

interface RatingCardProps {
  readonly data: {
    readonly symbol: string
    readonly rating: '强买' | '买入' | '持有' | '卖出' | '强卖'
    readonly confidence: number
    readonly targetPrice?: number
    readonly currentPrice: number
    readonly summary: string
    readonly keyFactors: readonly string[]
  }
}

const RATING_COLORS: Record<string, string> = {
  '强买': 'text-emerald-400 bg-emerald-500/15 border-emerald-500/20',
  '买入': 'text-green-400 bg-green-500/15 border-green-500/20',
  '持有': 'text-yellow-400 bg-yellow-500/15 border-yellow-500/20',
  '卖出': 'text-orange-400 bg-orange-500/15 border-orange-500/20',
  '强卖': 'text-red-400 bg-red-500/15 border-red-500/20',
}

export function RatingCard({ data }: RatingCardProps) {
  const colorClasses = RATING_COLORS[data.rating] ?? RATING_COLORS['持有']

  return (
    <div className='my-3 rounded-xl border border-white/5 bg-white/[0.02] p-4'>
      {/* 评级标头 */}
      <div className='flex items-center justify-between mb-3'>
        <div className='flex items-center gap-3'>
          <span className='text-xs text-slate-400'>{data.symbol}</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium border ${colorClasses}`}>
            {data.rating}
          </span>
        </div>
        <span className='text-xs text-slate-500'>置信度 {data.confidence}%</span>
      </div>

      {/* 价格信息 */}
      <div className='flex gap-4 mb-3 text-sm'>
        <div>
          <span className='text-slate-500 text-xs'>当前价</span>
          <p className='text-white'>${data.currentPrice.toFixed(2)}</p>
        </div>
        {data.targetPrice != null && (
          <div>
            <span className='text-slate-500 text-xs'>目标价</span>
            <p className='text-emerald-400'>${data.targetPrice.toFixed(2)}</p>
          </div>
        )}
      </div>

      {/* 摘要 */}
      <p className='text-xs text-slate-300 mb-3'>{data.summary}</p>

      {/* 关键因素 */}
      {data.keyFactors.length > 0 && (
        <div className='space-y-1'>
          {data.keyFactors.map((factor, i) => (
            <div key={i} className='flex items-start gap-2 text-xs text-slate-400'>
              <span className='text-emerald-500 mt-0.5'>-</span>
              <span>{factor}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
