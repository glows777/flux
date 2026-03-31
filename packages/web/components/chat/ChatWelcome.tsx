import { Sparkles, BarChart3, ShieldAlert, TrendingUp, GitCompare, Globe, ArrowLeftRight, BookOpen, Star } from 'lucide-react'

interface ChatWelcomeProps {
    readonly symbol?: string | null
    readonly assetName?: string | null
    readonly onSuggestionClick?: (text: string) => void
}

const GENERIC_SUGGESTIONS = [
    { icon: Globe, text: '分析今日大盘走势' },
    { icon: ArrowLeftRight, text: '对比两支股票' },
    { icon: BookOpen, text: '解释投资术语' },
    { icon: Star, text: '推荐值得关注的板块' },
] as const

function getSymbolSuggestions(symbol: string) {
    return [
        { icon: BarChart3, text: `分析 ${symbol} 最新财报` },
        { icon: ShieldAlert, text: `评估 ${symbol} 近期风险` },
        { icon: TrendingUp, text: `${symbol} 技术面走势分析` },
        { icon: GitCompare, text: `${symbol} 与同行业对比` },
    ] as const
}

export function ChatWelcome({ symbol, assetName, onSuggestionClick }: ChatWelcomeProps) {
    const suggestions = symbol ? getSymbolSuggestions(symbol) : GENERIC_SUGGESTIONS

    return (
        <div className='min-h-full flex items-center justify-center'>
            <div className='text-center max-w-lg space-y-6'>
                <div className='w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto'>
                    <Sparkles size={20} className='text-emerald-400' />
                </div>
                <h2 className='text-lg font-medium text-white'>
                    {symbol ? `关于 ${assetName ?? symbol}` : 'Flux AI 助手'}
                </h2>
                <p className='text-sm text-slate-400'>
                    {symbol
                        ? `我是 Flux 助手。关于 ${assetName ?? symbol}，你想了解什么？`
                        : '我是 Flux 助手，可以回答任何金融相关问题。试试问我关于市场、股票分析或投资策略的问题。'}
                </p>

                <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2'>
                    {suggestions.map(({ icon: Icon, text }) => (
                        <button
                            key={text}
                            type='button'
                            onClick={() => onSuggestionClick?.(text)}
                            className='flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:border-emerald-500/30 hover:bg-white/[0.07] transition-all text-left group/chip'
                        >
                            <Icon size={16} className='text-slate-500 group-hover/chip:text-emerald-400 transition-colors shrink-0' />
                            <span className='text-xs text-slate-400 group-hover/chip:text-slate-300 transition-colors'>{text}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}
