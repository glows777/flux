'use client'

interface SearchResultCardProps {
    readonly docPath: string
    readonly content: string
    readonly score: number
    readonly entities: readonly string[]
    readonly onNavigate: () => void
}

export function SearchResultCard({
    docPath,
    content,
    score,
    entities,
    onNavigate,
}: SearchResultCardProps) {
    return (
        <div className='border border-white/10 rounded-lg p-3 hover:border-white/20 transition-colors'>
            <div className='flex items-center gap-2 mb-1.5'>
                <span className='text-xs font-mono text-white'>{docPath}</span>
                <span className='text-[10px] text-emerald-400 font-mono'>
                    {score.toFixed(2)}
                </span>
                {entities.map((entity) => (
                    <span
                        key={entity}
                        className='px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px]'
                    >
                        {entity}
                    </span>
                ))}
            </div>
            <p className='text-xs text-slate-400 line-clamp-3 mb-2'>
                {content}
            </p>
            <button
                type='button'
                onClick={onNavigate}
                className='text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors'
            >
                查看 →
            </button>
        </div>
    )
}
