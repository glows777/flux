'use client'

import type { NewsItem as NewsItemType } from '@flux/shared'
import type { ReactNode } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { NewsItem } from './NewsItem'

const NEWS_SKELETON_KEYS = [
    'news-skeleton-1',
    'news-skeleton-2',
    'news-skeleton-3',
] as const

interface NewsFeedProps {
    symbol: string
}

function NewsFeedShell({ children }: { children: ReactNode }) {
    return (
        <div className='rounded-3xl border border-white/5 bg-white/[0.01] p-6'>
            <div className='flex items-center gap-2 mb-4'>
                <div className='w-1 h-4 bg-emerald-500 rounded-full' />
                <h3 className='text-sm font-medium text-white'>实时情报流</h3>
            </div>
            {children}
        </div>
    )
}

/**
 * 新闻流容器组件
 * 从 API 获取实时情报流数据
 */
export function NewsFeed({ symbol }: NewsFeedProps) {
    const {
        data: items,
        isLoading,
        error,
    } = useSWR<NewsItemType[]>(
        `/api/stocks/${encodeURIComponent(symbol)}/news?limit=20`,
        fetcher,
    )

    if (isLoading) {
        return (
            <NewsFeedShell>
                <div className='space-y-4'>
                    {NEWS_SKELETON_KEYS.map((key) => (
                        <div key={key} className='animate-pulse space-y-2'>
                            <div className='h-3 w-16 bg-white/5 rounded' />
                            <div className='h-4 w-full bg-white/5 rounded' />
                        </div>
                    ))}
                </div>
            </NewsFeedShell>
        )
    }

    if (error) {
        return (
            <NewsFeedShell>
                <p className='text-sm text-red-400'>新闻加载失败，请稍后再试</p>
            </NewsFeedShell>
        )
    }

    const newsList = items ?? []

    return (
        <NewsFeedShell>
            <div className='space-y-4'>
                {newsList.length === 0 ? (
                    <p className='text-sm text-slate-500'>暂无相关新闻</p>
                ) : (
                    newsList.map((news, index) => (
                        <NewsItem
                            key={news.id}
                            source={news.source}
                            time={news.time}
                            title={news.title}
                            sentiment={news.sentiment}
                            url={news.url}
                            isLast={index === newsList.length - 1}
                        />
                    ))
                )}
            </div>
        </NewsFeedShell>
    )
}
