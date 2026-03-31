'use client'

import { formatRelativeTime } from './DocTree'

interface DocMetaProps {
    readonly path: string
    readonly updatedAt?: string
    readonly evergreen?: boolean
    readonly entities?: readonly string[]
}

export function DocMeta({ path, updatedAt, evergreen, entities }: DocMetaProps) {
    return (
        <div className='flex flex-wrap items-center gap-2 px-4 py-2 border-b border-white/10 text-xs'>
            <span className='text-white font-mono'>{path}</span>

            {evergreen && (
                <span className='px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px]'>
                    evergreen
                </span>
            )}

            {updatedAt && (
                <span className='text-slate-600'>
                    {formatRelativeTime(updatedAt)}
                </span>
            )}

            {entities && entities.length > 0 && (
                <div className='flex gap-1 ml-auto'>
                    {entities.map((entity) => (
                        <span
                            key={entity}
                            className='px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px]'
                        >
                            {entity}
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}
