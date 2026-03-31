'use client'

import { AlertCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import useSWR from 'swr'
import { client } from '@/lib/api'
import { fetcher } from '@/lib/fetcher'
import type { CachedEarningsL1, CachedEarningsL2, FiscalQuarter } from '@/lib/finance/types'
import { L1Section, L1Skeleton } from './finance/L1Section'
import { L2Section, L2Shimmer } from './finance/L2Section'
import { QuarterSwitcher } from './finance/QuarterSwitcher'
import { TranscriptUpload } from './finance/TranscriptUpload'

interface FinanceTabProps {
    readonly symbol: string
}

/** Error with optional API error code from backend */
class ApiError extends Error {
    readonly code: string | undefined
    constructor(message: string, code?: string) {
        super(message)
        this.code = code
    }
}

function parseQuarterKey(key: string): { year: number; quarter: number } {
    const match = key.match(/^(\d{4})-Q([1-4])$/)
    if (!match) throw new Error(`Invalid quarter key: ${key}`)
    return { year: Number(match[1]), quarter: Number(match[2]) }
}

function isTranscriptNotFound(error: Error | undefined): boolean {
    if (!error) return false
    return 'code' in error && (error as { code?: string }).code === 'NOT_FOUND'
}

export function FinanceTab({ symbol }: FinanceTabProps) {
    const encodedSymbol = encodeURIComponent(symbol)

    // ─── Fiscal Quarters from API ───
    const {
        data: quarters,
        isLoading: quartersLoading,
        error: quartersError,
    } = useSWR<FiscalQuarter[]>(
        `/api/stocks/${encodedSymbol}/earnings/quarters`,
        fetcher,
    )

    const [userSelectedKey, setUserSelectedKey] = useState<string | null>(null)
    const [isRefreshing, setIsRefreshing] = useState(false)

    // Reset selection on symbol change
    useEffect(() => {
        setUserSelectedKey(null)
    }, [symbol])

    // Derive effective key: user's explicit selection, or default to first available quarter
    const selectedKey = userSelectedKey ?? (quarters?.[0]?.key ?? null)
    const parsed = selectedKey ? parseQuarterKey(selectedKey) : null
    const year = parsed?.year
    const quarter = parsed?.quarter

    // ─── L1 Data (guarded on selectedKey) ───
    const l1Key = selectedKey
        ? `/api/stocks/${encodedSymbol}/earnings?year=${year}&quarter=${quarter}`
        : null
    const {
        data: l1Result,
        isLoading: l1Loading,
        error: l1Error,
        mutate: mutateL1,
    } = useSWR<CachedEarningsL1>(l1Key, fetcher)

    // ─── L2 Data (conditional: only fetch when L1 succeeds) ───
    const l2Key = l1Result
        ? `earnings-analysis:${encodedSymbol}:${year}:${quarter}`
        : null
    const {
        data: l2Result,
        isLoading: l2Loading,
        error: l2Error,
        mutate: mutateL2,
    } = useSWR<CachedEarningsL2>(l2Key, async () => {
        const res = await client.api.stocks[':symbol'].earnings.analysis.$post({
            param: { symbol },
            json: { year: year!, quarter: quarter! },
        })
        const json = (await res.json()) as {
            success: boolean
            error?: string
            code?: string
            data?: CachedEarningsL2
        }
        if (!json.success)
            throw new ApiError(json.error ?? 'Unknown error', json.code)
        return json.data as CachedEarningsL2
    }, {
        onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
            if (error instanceof ApiError && error.code === 'NOT_FOUND') return
            if (retryCount >= 3) return
            setTimeout(() => revalidate({ retryCount }), 5000 * (retryCount + 1))
        },
    })

    // ─── Refresh Handler ───
    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true)
        try {
            await mutateL1()
            if (l2Key) await mutateL2()
        } finally {
            setIsRefreshing(false)
        }
    }, [mutateL1, mutateL2, l2Key])

    // ─── Transcript Upload Success → re-trigger L2 ───
    const handleTranscriptUploaded = useCallback(async () => {
        await mutateL2()
    }, [mutateL2])

    const transcriptMissing = isTranscriptNotFound(l2Error)

    // ─── Quarters Error ───
    if (quartersError) {
        return (
            <div className='animate-in fade-in duration-300 space-y-4'>
                <div className='rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 flex items-start gap-3'>
                    <AlertCircle className='w-4 h-4 text-rose-400 mt-0.5 shrink-0' />
                    <div>
                        <p className='text-sm text-rose-400'>
                            财报季度数据获取失败
                        </p>
                        <p className='text-xs text-slate-500 mt-1'>
                            请稍后重试
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    // ─── Render ───
    return (
        <div className='animate-in fade-in duration-300 space-y-4'>
            {/* Quarter Switcher */}
            <QuarterSwitcher
                quarters={quarters ?? []}
                selectedKey={selectedKey ?? ''}
                onQuarterChange={setUserSelectedKey}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
                isLoading={quartersLoading}
                cachedAt={l1Result?.cachedAt ?? null}
            />

            {/* L1 Section */}
            {l1Loading ? (
                <L1Skeleton />
            ) : l1Error ? (
                <div className='rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 flex items-start gap-3'>
                    <AlertCircle className='w-4 h-4 text-rose-400 mt-0.5 shrink-0' />
                    <div>
                        <p className='text-sm text-rose-400'>
                            财报数据获取失败
                        </p>
                        <p className='text-xs text-slate-500 mt-1'>
                            请稍后重试
                        </p>
                    </div>
                </div>
            ) : l1Result ? (
                <L1Section data={l1Result.data} />
            ) : null}

            {/* Separator */}
            {l1Result && <hr className='border-t border-white/5' />}

            {/* L2 Section */}
            {l1Result && (
                <>
                    {l2Loading ? (
                        <L2Shimmer />
                    ) : l2Error ? (
                        transcriptMissing ? (
                            <TranscriptUpload
                                symbol={symbol}
                                year={year!}
                                quarter={quarter!}
                                reportDate={l1Result.data.reportDate}
                                onUploaded={handleTranscriptUploaded}
                            />
                        ) : (
                            <div className='rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 flex items-start gap-3'>
                                <AlertCircle className='w-4 h-4 text-rose-400 mt-0.5 shrink-0' />
                                <div>
                                    <p className='text-sm text-rose-400'>
                                        AI 分析失败
                                    </p>
                                    <p className='text-xs text-slate-500 mt-1'>
                                        请稍后重试
                                    </p>
                                </div>
                            </div>
                        )
                    ) : l2Result ? (
                        <L2Section data={l2Result.data} />
                    ) : null}
                </>
            )}
        </div>
    )
}
