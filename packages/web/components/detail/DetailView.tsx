'use client'

import type { StockMetrics } from '@flux/shared'
import { ArrowUpRight, Maximize2, Minimize2 } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
    Group,
    Panel,
    Separator,
    useDefaultLayout,
    usePanelRef,
} from 'react-resizable-panels'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { AICortex } from './AICortex'
import { MetricsGrid } from './MetricsGrid'
import { NewsFeed } from './NewsFeed'
import { PositionCard, usePosition } from './PositionCard'
import { PriceChart } from './PriceChart'
import { ResizeHandle } from './ResizeHandle'

interface DetailViewProps {
    symbol: string
}

const noopStorage: Storage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    get length() {
        return 0
    },
}

const DETAIL_SKELETON_KEYS = [
    'detail-skeleton-1',
    'detail-skeleton-2',
    'detail-skeleton-3',
    'detail-skeleton-4',
] as const

function BackLink() {
    return (
        <Link
            href='/'
            className='self-start flex items-center gap-2 text-slate-500 hover:text-white text-xs font-medium uppercase tracking-widest transition-colors mb-2'
        >
            <ArrowUpRight size={14} className='rotate-[-135deg]' />
            返回仪表盘
        </Link>
    )
}

function DetailSkeleton() {
    return (
        <div className='max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-8'>
            <div className='flex-1 flex flex-col gap-6'>
                <div className='h-4 w-24 bg-white/5 rounded animate-pulse' />
                <div className='rounded-3xl border border-white/5 bg-white/[0.02] p-8 animate-pulse'>
                    <div className='h-12 w-48 bg-white/5 rounded mb-4' />
                    <div className='h-[350px] bg-white/5 rounded' />
                </div>
                <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                    {DETAIL_SKELETON_KEYS.map((key) => (
                        <div
                            key={key}
                            className='animate-pulse rounded-2xl border border-white/5 bg-white/[0.02] p-4 h-20'
                        />
                    ))}
                </div>
            </div>
            <div className='w-full lg:w-[33%]'>
                <div className='animate-pulse rounded-3xl border border-white/5 bg-white/[0.02] h-96' />
            </div>
        </div>
    )
}

/**
 * Detail 视图客户端组件
 * 包含左侧数据展示和右侧 AI Panel
 *
 * 大屏 (>=1024px): 可拖拽分割面板，比例持久化到 localStorage
 * 小屏 (<1024px): 上下堆叠
 */
export function DetailView({ symbol }: DetailViewProps) {
    const [aiThinking, setAiThinking] = useState(false)
    const [expandedPanel, setExpandedPanel] = useState<'chart' | 'ai' | null>(
        null,
    )

    const chartPanelRef = usePanelRef()
    const aiPanelRef = usePanelRef()

    // Ref to avoid stale closure in onResize callbacks
    const expandedPanelRef = useRef(expandedPanel)
    expandedPanelRef.current = expandedPanel

    const encodedSymbol = encodeURIComponent(symbol)
    const {
        data: info,
        isLoading,
        error,
    } = useSWR<StockMetrics>(`/api/stocks/${encodedSymbol}/info`, fetcher)
    const { data: position } = usePosition(symbol)

    const storage =
        typeof window !== 'undefined' ? window.localStorage : noopStorage
    const { defaultLayout, onLayoutChanged } = useDefaultLayout({
        id: 'flux-detail-layout',
        storage,
    })

    // Toggle handlers use isCollapsed() for ground truth, not React state.
    // This avoids desync when layout is restored from localStorage on re-mount.
    const toggleExpandChart = useCallback(() => {
        if (aiPanelRef.current?.isCollapsed()) {
            aiPanelRef.current.expand()
            setExpandedPanel(null)
        } else {
            aiPanelRef.current?.collapse()
            setExpandedPanel('chart')
        }
    }, [aiPanelRef])

    const toggleExpandAI = useCallback(() => {
        if (chartPanelRef.current?.isCollapsed()) {
            chartPanelRef.current.expand()
            setExpandedPanel(null)
        } else {
            chartPanelRef.current?.collapse()
            setExpandedPanel('ai')
        }
    }, [chartPanelRef])

    // Sync state when user manually drags separator to restore a collapsed panel
    const handleChartResize = useCallback(() => {
        if (
            expandedPanelRef.current === 'ai' &&
            !chartPanelRef.current?.isCollapsed()
        ) {
            setExpandedPanel(null)
        }
    }, [chartPanelRef])

    const handleAIResize = useCallback(() => {
        if (
            expandedPanelRef.current === 'chart' &&
            !aiPanelRef.current?.isCollapsed()
        ) {
            setExpandedPanel(null)
        }
    }, [aiPanelRef])

    // Sync expandedPanel state with actual panel collapsed state on mount.
    // Handles case where collapsed layout is restored from localStorage.
    useEffect(() => {
        const chartCollapsed = chartPanelRef.current?.isCollapsed() ?? false
        const aiCollapsed = aiPanelRef.current?.isCollapsed() ?? false
        if (chartCollapsed && !aiCollapsed) {
            setExpandedPanel('ai')
        } else if (!chartCollapsed && aiCollapsed) {
            setExpandedPanel('chart')
        }
    }, [chartPanelRef, aiPanelRef])

    useEffect(() => {
        setAiThinking(true)
        const timer = setTimeout(() => setAiThinking(false), 2000)
        return () => clearTimeout(timer)
    }, [])

    if (isLoading) {
        return <DetailSkeleton />
    }

    if (error) {
        return (
            <div className='flex items-center justify-center h-full'>
                <div className='text-center space-y-4'>
                    <h1 className='text-3xl font-light text-white'>
                        无法加载: {symbol.toUpperCase()}
                    </h1>
                    <p className='text-sm text-red-400'>{error.message}</p>
                    <Link
                        href='/'
                        className='inline-block mt-4 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-xs font-medium rounded-lg transition-all'
                    >
                        返回仪表盘
                    </Link>
                </div>
            </div>
        )
    }

    const name = info?.name ?? symbol.toUpperCase()

    return (
        <div className='max-w-[1400px] mx-auto lg:h-full'>
            {/* === Large screens: resizable split panels === */}
            <div className='hidden lg:flex flex-col h-full'>
                <div className='mb-2 animate-in slide-in-from-right-8 duration-500'>
                    <BackLink />
                </div>
                <Group
                    className='flex-1 min-h-0'
                    orientation='horizontal'
                    defaultLayout={defaultLayout}
                    onLayoutChanged={onLayoutChanged}
                >
                    <Panel
                        id='chart-panel'
                        panelRef={chartPanelRef}
                        collapsible
                        defaultSize='67%'
                        minSize='30%'
                        onResize={handleChartResize}
                    >
                        <div className='group/panel relative h-full animate-in slide-in-from-right-8 duration-500'>
                            <button
                                type='button'
                                onClick={toggleExpandChart}
                                className='absolute top-1 right-4 z-10 p-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all opacity-0 group-hover/panel:opacity-100'
                                title={
                                    expandedPanel === 'chart'
                                        ? '恢复默认布局'
                                        : '图表全屏'
                                }
                            >
                                {expandedPanel === 'chart' ? (
                                    <Minimize2 size={14} />
                                ) : (
                                    <Maximize2 size={14} />
                                )}
                            </button>
                            <div className='flex flex-col gap-6 pr-2 overflow-y-auto h-full'>
                                <PriceChart
                                    symbol={symbol}
                                    name={name}
                                    position={position}
                                />
                                <PositionCard symbol={symbol} />
                                <MetricsGrid symbol={symbol} />
                                <NewsFeed symbol={symbol} />
                            </div>
                        </div>
                    </Panel>

                    <Separator
                        className='group flex items-center justify-center cursor-col-resize'
                        style={{ width: '8px' }}
                    >
                        <ResizeHandle />
                    </Separator>

                    <Panel
                        id='ai-panel'
                        panelRef={aiPanelRef}
                        collapsible
                        defaultSize='33%'
                        minSize='25%'
                        onResize={handleAIResize}
                    >
                        <div className='group/panel relative flex flex-col h-full overflow-hidden pl-2 animate-in slide-in-from-right-8 duration-500'>
                            <button
                                type='button'
                                onClick={toggleExpandAI}
                                className='absolute top-5 right-5 z-10 p-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all opacity-0 group-hover/panel:opacity-100'
                                title={
                                    expandedPanel === 'ai'
                                        ? '恢复默认布局'
                                        : 'AI 面板全屏'
                                }
                            >
                                {expandedPanel === 'ai' ? (
                                    <Minimize2 size={14} />
                                ) : (
                                    <Maximize2 size={14} />
                                )}
                            </button>
                            <AICortex
                                symbol={symbol}
                                assetName={name}
                                aiThinking={aiThinking}
                            />
                        </div>
                    </Panel>
                </Group>
            </div>

            {/* === Small screens: stacked layout === */}
            <div className='lg:hidden flex flex-col gap-6 animate-in slide-in-from-right-8 duration-500'>
                <BackLink />
                <PriceChart symbol={symbol} name={name} position={position} />
                <PositionCard symbol={symbol} />
                <MetricsGrid symbol={symbol} />
                <NewsFeed symbol={symbol} />
                <AICortex
                    symbol={symbol}
                    assetName={name}
                    aiThinking={aiThinking}
                />
            </div>
        </div>
    )
}
