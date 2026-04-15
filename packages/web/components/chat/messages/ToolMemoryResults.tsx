import { FileText } from 'lucide-react'

interface MemoryResult {
    readonly docPath: string
    readonly content: string
    readonly score: number
    readonly entities: readonly string[]
}

interface ToolMemoryResultsProps {
    readonly results: readonly MemoryResult[]
}

function extractDocName(docPath: string): string {
    return docPath.split('/').pop() ?? docPath
}

function truncateSnippet(content: string, maxLen = 30): string {
    const trimmed = content.replace(/\n/g, ' ').trim()
    return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}...` : trimmed
}

export function ToolMemoryResults({ results }: ToolMemoryResultsProps) {
    if (results.length === 0) return null

    return (
        <div className='mt-1.5 rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden'>
            {results.map((result) => (
                <div
                    key={result.docPath}
                    className='flex items-center gap-2.5 px-3 py-2 border-b border-white/5 last:border-b-0'
                >
                    <FileText size={14} className='text-slate-600 shrink-0' />
                    <span className='text-xs text-slate-400 shrink-0'>
                        {extractDocName(result.docPath)}
                    </span>
                    <span className='text-[11px] text-slate-600 truncate'>
                        &ldquo;{truncateSnippet(result.content)}&rdquo;
                    </span>
                </div>
            ))}
        </div>
    )
}
