// components/chat/messages/MessageContent.tsx

import type { UIMessage } from 'ai'
import { useMemo } from 'react'
import type { Components } from 'react-markdown'
import Markdown from 'react-markdown'
import { ComparisonTable } from '@/components/detail/tabs/chat/ComparisonTable'
// TODO: Temporary imports from old location — migrate RatingCard, ComparisonTable,
// and SignalBadges to components/chat/messages/ in a follow-up.
import { RatingCard } from '@/components/detail/tabs/chat/RatingCard'
import { SignalBadges } from '@/components/detail/tabs/chat/SignalBadges'
import { groupPartsToSegments } from '@/lib/ai/tool-timeline'
import { ToolTimeline } from './ToolTimeline'

// [C4 fix] Sanitize links to prevent javascript: XSS
const markdownComponents: Components = {
    a: ({ href, children }) => (
        <a
            href={href && /^https?:\/\//.test(href) ? href : '#'}
            target='_blank'
            rel='noopener noreferrer'
        >
            {children}
        </a>
    ),
}

function DisplayTool({
    toolName,
    output,
}: {
    readonly toolName: string
    readonly output: unknown
}) {
    const data = output as Record<string, unknown>
    switch (toolName) {
        case 'display_rating_card':
            return (
                <RatingCard
                    data={
                        data as React.ComponentProps<typeof RatingCard>['data']
                    }
                />
            )
        case 'display_comparison_table':
            return (
                <ComparisonTable
                    data={
                        data as React.ComponentProps<
                            typeof ComparisonTable
                        >['data']
                    }
                />
            )
        case 'display_signal_badges':
            return (
                <SignalBadges
                    data={
                        data as React.ComponentProps<
                            typeof SignalBadges
                        >['data']
                    }
                />
            )
        default:
            return null
    }
}

export function MessageContent({ message }: { readonly message: UIMessage }) {
    const segments = useMemo(
        () => groupPartsToSegments(message.parts),
        [message.parts],
    )

    return (
        <>
            {segments.map((seg) => {
                switch (seg.type) {
                    case 'timeline':
                        return (
                            <ToolTimeline
                                key={`tl-${seg.startIndex}`}
                                steps={seg.steps}
                                defaultCollapsed={seg.collapsed}
                            />
                        )
                    case 'text':
                        return (
                            <div
                                key={`txt-${seg.startIndex}`}
                                className='prose prose-invert prose-sm max-w-none'
                            >
                                <Markdown components={markdownComponents}>
                                    {seg.content}
                                </Markdown>
                            </div>
                        )
                    case 'display':
                        return (
                            <DisplayTool
                                key={`dsp-${seg.startIndex}`}
                                toolName={seg.toolName}
                                output={seg.output}
                            />
                        )
                    default:
                        return null
                }
            })}
        </>
    )
}
