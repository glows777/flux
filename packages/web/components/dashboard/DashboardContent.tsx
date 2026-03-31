'use client'

import { Radio, RefreshCw, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import useSWR from 'swr'
import { BriefSkeleton } from '@/components/dashboard/brief/BriefSkeleton'
import { CatalystList } from '@/components/dashboard/brief/CatalystList'
import { SpotlightCard } from '@/components/dashboard/brief/SpotlightCard'
import { StatsGrid } from '@/components/dashboard/StatsGrid'
import { showToast } from '@/components/ui/Toast'
import { Watchlist } from '@/components/dashboard/Watchlist'
import { fetcher } from '@/lib/fetcher'
import type { DashboardData } from '@flux/shared'
import { formatBriefTime, getGreeting } from '@flux/shared'

// ─── Signal pill badge color mapping ───

import * as Tooltip from '@radix-ui/react-tooltip'

const SIGNAL_COLORS = {
    'risk-on': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    'risk-off': 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    neutral: 'text-slate-400 bg-white/5 border-white/10',
} as const

const SIGNAL_DESCRIPTIONS: Record<string, string> = {
    'risk-on': '市场偏向冒险，资金流入成长股和高风险资产，VIX 处于低位。',
    'risk-off': '市场避险情绪升温，资金流向债券、黄金等安全资产，VIX 处于高位。',
    neutral: '市场情绪中性，无明显方向偏好。',
}

function MacroSignalPill({
    signal,
}: {
    signal: 'risk-on' | 'risk-off' | 'neutral'
}) {
    return (
        <Tooltip.Provider delayDuration={300}>
            <Tooltip.Root>
                <Tooltip.Trigger asChild>
                    <span
                        className={`px-1.5 py-0.5 rounded text-xs border font-medium inline cursor-help ${SIGNAL_COLORS[signal]}`}
                    >
                        {signal}
                    </span>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                    <Tooltip.Content
                        className="max-w-[240px] rounded-lg bg-slate-800 border border-white/10 px-3 py-2 text-xs text-slate-300 leading-relaxed shadow-xl"
                        sideOffset={6}
                        side="bottom"
                    >
                        {SIGNAL_DESCRIPTIONS[signal]}
                        <Tooltip.Arrow className="fill-slate-800" />
                    </Tooltip.Content>
                </Tooltip.Portal>
            </Tooltip.Root>
        </Tooltip.Provider>
    )
}

function renderMacroWithSignal(
    summary: string,
    signal: 'risk-on' | 'risk-off' | 'neutral',
) {
    return (
        <>
            {summary}
            <MacroSignalPill signal={signal} />
        </>
    )
}

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

    // Dashboard composite data (portfolio + watchlist + brief)
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
                watchlist: prev.watchlist?.filter(item => item.id !== symbol),
            } : prev,
            { revalidate: true },
        )
    }, [mutateDashboard])

    const portfolio = dashboard?.portfolio
    const watchlistItems = dashboard?.watchlist
    const brief = dashboard?.brief
    const positionSymbols = dashboard?.positionSymbols ?? []

    // Brief expand/collapse
    const [expanded, setExpanded] = useState(false)
    const [refreshing, setRefreshing] = useState(false)

    const spotlight = brief?.spotlight ?? []
    const catalysts = brief?.catalysts ?? []
    const displayedSpotlight = expanded
        ? spotlight
        : spotlight.slice(0, 3)

    const handleRefresh = async () => {
        setRefreshing(true)
        try {
            const res = await fetch('/api/brief', { method: 'POST' })
            if (!res.ok) throw new Error(`POST /api/brief failed: ${res.status}`)
            const json = await res.json()
            if (!json.success) throw new Error(json.error ?? 'Refresh failed')
            await mutateDashboard(
                (prev) => (prev ? { ...prev, brief: json.data } : prev),
                { revalidate: false },
            )
        } catch {
            showToast('刷新失败，请稍后再试')
        } finally {
            setRefreshing(false)
        }
    }

    const hasBrief = brief && !dashboardError

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
                        ) : hasBrief ? (
                            <p className='text-slate-500 text-sm flex items-center gap-1.5'>
                                <Radio size={12} className='shrink-0 text-slate-500' />
                                {renderMacroWithSignal(
                                    brief.macro.summary,
                                    brief.macro.signal,
                                )}
                            </p>
                        ) : (
                            <p className='text-slate-500 text-sm'>
                                今日市场资金流向呈现{' '}
                                <span className='text-emerald-400 font-medium'>
                                    吸筹蓄势
                                </span>{' '}
                                态势。
                            </p>
                        )}
                    </div>
                    <button type='button' onClick={() => router.push('/chat')} className='flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-xs font-medium rounded-lg transition-all hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]'>
                        <Sparkles size={14} />
                        <span>询问 Flux AI</span>
                    </button>
                </div>

                {/* Morning Brief */}
                {dashboardLoading ? (
                    <BriefSkeleton />
                ) : hasBrief && spotlight.length > 0 ? (
                    <>
                        {/* Spotlight + Catalysts grid */}
                        <div className='grid grid-cols-1 md:grid-cols-12 gap-6'>
                            <div
                                data-testid='spotlight-column'
                                className={
                                    catalysts.length > 0
                                        ? 'md:col-span-8'
                                        : 'md:col-span-12'
                                }
                            >
                                <div className='space-y-4'>
                                    {displayedSpotlight.map((item) => (
                                        <SpotlightCard
                                            key={item.symbol}
                                            item={item}
                                        />
                                    ))}
                                </div>
                                {spotlight.length > 3 && (
                                    <button
                                        type='button'
                                        onClick={() =>
                                            setExpanded((prev) => !prev)
                                        }
                                        className='text-slate-500 text-xs hover:text-slate-300 transition-colors cursor-pointer mt-4'
                                    >
                                        {expanded
                                            ? '收起 ▴'
                                            : `查看全部 ${spotlight.length} 只持仓 ▾`}
                                    </button>
                                )}
                            </div>

                            {catalysts.length > 0 && (
                                <div
                                    data-testid='catalyst-column'
                                    className='md:col-span-4'
                                >
                                    <CatalystList items={catalysts} />
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className='flex items-center justify-between'>
                            <span className='text-slate-600 text-xs'>
                                由 Flux AI 生成 · 数据截至{' '}
                                {formatBriefTime(brief.generatedAt)}
                            </span>
                            <button
                                type='button'
                                data-testid='brief-refresh'
                                onClick={handleRefresh}
                                disabled={refreshing}
                                className='flex items-center gap-1 text-slate-500 hover:text-emerald-400 transition-colors text-xs disabled:opacity-50'
                            >
                                <RefreshCw
                                    size={12}
                                    className={
                                        refreshing ? 'animate-spin' : ''
                                    }
                                />
                                <span>刷新</span>
                            </button>
                        </div>
                    </>
                ) : hasBrief && spotlight.length === 0 ? (
                    <div className='rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center'>
                        <p className='text-sm text-slate-400 mb-4'>
                            连接 Alpaca 账户后即可生成持仓分析
                        </p>
                    </div>
                ) : null}

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
