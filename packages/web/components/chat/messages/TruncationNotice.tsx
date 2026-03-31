import { Info } from 'lucide-react'
import { TRUNCATE_LIMIT } from '@/lib/ai/constants'

export function TruncationNotice() {
    return (
        <div className='flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-500/10 border border-slate-500/10 text-xs text-slate-400'>
            <Info size={12} className='shrink-0' />
            <span>早期对话已省略，AI 仅参考最近 {TRUNCATE_LIMIT} 条消息</span>
        </div>
    )
}
