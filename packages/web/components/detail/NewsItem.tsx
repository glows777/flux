'use client'

import type { NewsItem as NewsItemType } from '@flux/shared'
import { formatRelativeTime } from '@flux/shared'

interface NewsItemProps {
    source: string
    time: string
    title: string
    sentiment: NewsItemType['sentiment']
    url?: string
    isLast?: boolean
}

const SENTIMENT_STYLES: Record<NewsItemType['sentiment'], string> = {
    positive: 'text-emerald-400 bg-emerald-400/10',
    negative: 'text-red-400 bg-red-400/10',
    neutral: 'text-slate-400 bg-white/5',
}

const SENTIMENT_LABELS: Record<NewsItemType['sentiment'], string> = {
    positive: 'Bullish',
    negative: 'Bearish',
    neutral: 'Neutral',
}

/**
 * 新闻条目组件
 * 显示单条新闻的来源、时间、情感标签和标题
 */
export function NewsItem({
    source,
    time,
    title,
    sentiment,
    url,
    isLast = false,
}: NewsItemProps) {
    const Wrapper = url ? 'a' : 'div'
    const linkProps = url
        ? { href: url, target: '_blank' as const, rel: 'noopener noreferrer' }
        : {}

    return (
        <Wrapper
            {...linkProps}
            className={`group block pb-3 cursor-pointer ${
                isLast ? '' : 'border-b border-white/5'
            }`}
        >
            {/* Meta: 来源、情感标签和时间 */}
            <div className='flex justify-between items-start mb-1'>
                <div className='flex items-center gap-1.5'>
                    <span className='text-[10px] text-slate-400 bg-white/5 px-1.5 py-0.5 rounded'>
                        {source}
                    </span>
                    {sentiment !== 'neutral' && (
                        <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${SENTIMENT_STYLES[sentiment]}`}
                        >
                            {SENTIMENT_LABELS[sentiment]}
                        </span>
                    )}
                </div>
                <span className='text-[10px] text-slate-600'>
                    {formatRelativeTime(time)}
                </span>
            </div>

            {/* 标题 */}
            <h4 className='text-sm text-slate-300 group-hover:text-emerald-400 transition-colors leading-snug'>
                {title}
            </h4>
        </Wrapper>
    )
}
