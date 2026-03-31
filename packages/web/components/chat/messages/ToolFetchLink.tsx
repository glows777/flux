import { ExternalLink } from 'lucide-react'
import { getFaviconUrl } from '@/lib/ai/tool-timeline'

interface ToolFetchLinkProps {
    readonly url: string
    readonly title?: string
}

function extractDomain(url: string): string {
    try {
        return new URL(url).hostname
    } catch {
        return url
    }
}

function extractPath(url: string): string {
    try {
        const u = new URL(url)
        return u.hostname + u.pathname
    } catch {
        return url
    }
}

export function ToolFetchLink({ url, title }: ToolFetchLinkProps) {
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 group"
        >
            <img
                src={getFaviconUrl(url)}
                alt=""
                width={14}
                height={14}
                className="rounded-sm shrink-0"
                onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                }}
            />
            <span className="text-xs text-slate-400 truncate flex-1 group-hover:text-slate-300 transition-colors">
                {title ?? extractPath(url)}
            </span>
            <span className="text-[11px] text-slate-600 shrink-0">
                {extractDomain(url)}
            </span>
            <ExternalLink size={11} className="text-slate-600 shrink-0" />
        </a>
    )
}
