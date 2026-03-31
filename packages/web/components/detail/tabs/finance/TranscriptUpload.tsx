'use client'

import { useState, useCallback } from 'react'
import { Upload, AlertCircle, CheckCircle2 } from 'lucide-react'
import { client } from '@/lib/api'

interface TranscriptUploadProps {
    readonly symbol: string
    readonly year: number
    readonly quarter: number
    readonly reportDate: string
    readonly onUploaded: () => void
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

const MIN_CONTENT_LENGTH = 100

export function TranscriptUpload({
    symbol,
    year,
    quarter,
    reportDate,
    onUploaded,
}: TranscriptUploadProps) {
    const [content, setContent] = useState('')
    const [status, setStatus] = useState<UploadStatus>('idle')
    const [errorMessage, setErrorMessage] = useState('')

    const trimmedContent = content.trim()
    const canSubmit = trimmedContent.length >= MIN_CONTENT_LENGTH && status !== 'uploading'

    const handleSubmit = useCallback(async () => {
        if (!canSubmit) return

        setStatus('uploading')
        setErrorMessage('')

        try {
            const res = await client.api.stocks[':symbol'].earnings.transcript.$put({
                param: { symbol },
                json: {
                    year,
                    quarter,
                    content: trimmedContent,
                    reportDate,
                },
            })

            const json = await res.json() as { success: boolean; error?: string }
            if (!json.success) {
                throw new Error(json.error ?? 'Upload failed')
            }

            setStatus('success')
            setContent('')
            onUploaded()
        } catch (error) {
            setStatus('error')
            setErrorMessage(error instanceof Error ? error.message : 'Upload failed')
        }
    }, [canSubmit, symbol, year, quarter, trimmedContent, reportDate, onUploaded])

    if (status === 'success') {
        return (
            <div className='rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-start gap-3'>
                <CheckCircle2 className='w-4 h-4 text-emerald-400 mt-0.5 shrink-0' />
                <div>
                    <p className='text-sm text-emerald-400'>Transcript 上传成功</p>
                    <p className='text-xs text-slate-500 mt-1'>
                        正在重新生成 AI 分析...
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className='rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3'>
            {/* Header */}
            <div className='flex items-start gap-3'>
                <AlertCircle className='w-4 h-4 text-amber-400 mt-0.5 shrink-0' />
                <div>
                    <p className='text-sm text-amber-400'>
                        该季度暂无 Earnings Call Transcript
                    </p>
                    <p className='text-xs text-slate-500 mt-1'>
                        FMP API 未返回 {year} Q{quarter} 的电话会议记录，可手动粘贴 transcript 以生成 AI 分析
                    </p>
                </div>
            </div>

            {/* Textarea */}
            <textarea
                value={content}
                onChange={(e) => {
                    setContent(e.target.value)
                    if (status === 'error') setStatus('idle')
                }}
                placeholder='粘贴 Earnings Call Transcript 内容 (至少 100 字符)...'
                rows={6}
                className='w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 resize-y focus:outline-none focus:border-amber-500/50'
            />

            {/* Footer */}
            <div className='flex items-center justify-between'>
                <span className='text-xs text-slate-600'>
                    {trimmedContent.length} / {MIN_CONTENT_LENGTH}+ 字符
                </span>

                <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className='flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
                >
                    <Upload className='w-3 h-3' />
                    {status === 'uploading' ? '上传中...' : '上传 Transcript'}
                </button>
            </div>

            {/* Error */}
            {status === 'error' && errorMessage && (
                <p className='text-xs text-rose-400'>{errorMessage}</p>
            )}
        </div>
    )
}
