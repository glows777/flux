'use client'

import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'

interface DocPreviewProps {
    readonly content: string
}

const components: Components = {
    a: ({ href, children, ...props }) => {
        const safeHref =
            href && /^https?:\/\//.test(href) ? href : undefined
        return (
            <a
                {...props}
                href={safeHref}
                target='_blank'
                rel='noopener noreferrer'
                className='text-emerald-400 hover:underline'
            >
                {children}
            </a>
        )
    },
}

export function DocPreview({ content }: DocPreviewProps) {
    return (
        <div className='prose prose-invert prose-sm max-w-none px-4 py-3'>
            <ReactMarkdown remarkPlugins={[remarkBreaks]} components={components}>{content}</ReactMarkdown>
        </div>
    )
}
