import { getFaviconUrl } from '@/lib/ai/tool-timeline'

interface Source {
    readonly title: string
    readonly url: string
    readonly score: number
}

interface ToolSearchResultsProps {
    readonly sources: readonly Source[]
    readonly maxVisible?: number
}

function extractDomain(url: string): string {
    try {
        return new URL(url).hostname
    } catch {
        return url
    }
}

export function ToolSearchResults({
    sources,
    maxVisible = 5,
}: ToolSearchResultsProps) {
    if (sources.length === 0) return null

    const visible = sources.slice(0, maxVisible)
    const remaining = sources.length - visible.length

    return (
        <div className="mt-1.5 rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
            {visible.map((source) => (
                <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-3 py-2 border-b border-white/5 last:border-b-0 hover:bg-white/[0.03] transition-colors group"
                >
                    <img
                        src={getFaviconUrl(source.url)}
                        alt=""
                        width={14}
                        height={14}
                        className="rounded-sm shrink-0"
                        onError={(e) => {
                            ;(e.target as HTMLImageElement).style.display =
                                'none'
                        }}
                    />
                    <span className="text-xs text-slate-400 truncate flex-1 group-hover:text-slate-300 transition-colors">
                        {source.title}
                    </span>
                    <span className="text-[11px] text-slate-600 shrink-0">
                        {extractDomain(source.url)}
                    </span>
                </a>
            ))}
            {remaining > 0 && (
                <div className="px-3 py-1.5 text-[11px] text-slate-600 text-center">
                    +{remaining} more
                </div>
            )}
        </div>
    )
}
