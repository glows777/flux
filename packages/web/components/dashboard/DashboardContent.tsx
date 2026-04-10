'use client'

import { Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import useSWR from 'swr'
import { StatsGrid } from '@/components/dashboard/StatsGrid'
import { Watchlist } from '@/components/dashboard/Watchlist'
import { fetcher } from '@/lib/fetcher'
import type { DashboardData } from '@flux/shared'
import { getGreeting } from '@flux/shared'

// ─── Skeleton components ───

function WatchlistSkeleton() {
    return (
        <div className='space-y-4'>
            <div className='flex items-center justify-between px-4 pb-2'>
                <div className='h-3 w-20 bg-white/5 rounded animate-pulse' />
                <div className='h-3 w-3 bg-white/5 rounded animate-pulse' />
            </div>
            <div className='flex flex-col gap-3'>
                {Array.from({ length: 5 }, (_, i) => (
                    <div
                        key={i}
                        className='animate-pulse rounded-2xl border border-white/5 bg-white/[0.02] p-5 flex items-center gap-4'
                    >
                        <div className='h-5 w-14 bg-white/5 rounded' />
                        <div className='h-4 w-20 bg-white/5 rounded' />
                        <div className='flex-1' />
                        <div className='h-8 w-24 bg-white/5 rounded' />
                        <div className='h-4 w-16 bg-white/5 rounded' />
                    </div>
                ))}
            </div>
        </div>
    )
}

function StatsGridSkeleton() {
    return (
        <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
            {Array.from({ length: 3 }, (_, i) => (
                <div
                    key={i}
                    className='animate-pulse p-6 rounded-2xl border border-white/5 bg-white/[0.02]'
                >
                    <div className='h-3 w-20 bg-white/5 rounded mb-3' />
                    <div className='h-8 w-32 bg-white/5 rounded mb-2' />
                    <div className='h-3 w-24 bg-white/5 rounded' />
                </div>
            ))}
        </div>
    )
}

// ─── Main component ───

export function DashboardContent() {
    const router = useRouter()

    // Dashboard composite data (portfolio + watchlist)
    const {
        data: dashboard,
        isLoading: dashboardLoading,
        error: dashboardError,
        mutate: mutateDashboard,
    } = useSWR<DashboardData>('/api/dashboard', fetcher)

    const handleWatchlistDelete = useCallback((symbol: string) => {
        mutateDashboard(
            (prev) => prev ? {
                ...prev,
                watchlist: prev.watchlist
                    ? prev.watchlist.filter(item => item.id !== symbol)
                    : prev.watchlist,
            } : prev,
            { revalidate: true },
        )
    }, [mutateDashboard])

    const portfolio = dashboard?.portfolio
    const watchlistItems = dashboard?.watchlist
    const positionSymbols = dashboard?.positionSymbols ?? []

    return (
        <div className='flex-1 overflow-y-auto p-6 md:p-10'>
            <div className='max-w-6xl mx-auto space-y-10'>
                {/* 欢迎语 / 头部 */}
                <div className='flex justify-between items-end'>
                    <div>
                        <h1 className='text-3xl font-light text-white mb-2'>
                            {getGreeting()}, Liam.
                        </h1>
                        {dashboardLoading ? (
                            <div className='h-4 w-3/4 bg-white/5 rounded animate-pulse mt-2' />
                        ) : (
                            <p className='text-slate-500 text-sm'>
                                组合概览与自选股会在这里实时更新。
                            </p>
                        )}
                    </div>
                    <button type='button' onClick={() => router.push('/chat')} className='flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-xs font-medium rounded-lg transition-all hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]'>
                        <Sparkles size={14} />
                        <span>询问 Flux AI</span>
                    </button>
                </div>

                {/* 核心指标卡片 */}
                {dashboardLoading ? (
                    <StatsGridSkeleton />
                ) : (
                    <StatsGrid
                        data={portfolio?.summary ?? null}
                    />
                )}

                {/* 自选股列表 */}
                {dashboardLoading ? (
                    <WatchlistSkeleton />
                ) : dashboardError ? (
                    <div className='rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center'>
                        <p className='text-sm text-red-400'>
                            自选股加载失败，请稍后再试
                        </p>
                    </div>
                ) : (
                    <Watchlist
                        items={watchlistItems ? [...watchlistItems] : []}
                        onMutate={() => mutateDashboard()}
                        onDelete={handleWatchlistDelete}
                        positionSymbols={positionSymbols}
                    />
                )}
            </div>
        </div>
    )
}
