import type { UIMessage } from 'ai'
import { Cpu } from 'lucide-react'
import { MessageContent } from './MessageContent'

export function AssistantMessage({
    message,
    isLast,
    isLoading,
}: {
    readonly message: UIMessage
    readonly isLast: boolean
    readonly isLoading: boolean
}) {
    return (
        <div className='flex gap-3'>
            <div className='w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0'>
                <Cpu size={14} className='text-emerald-400' />
            </div>
            <div className='p-3 bg-white/5 rounded-2xl rounded-tl-none border border-white/5 text-sm text-slate-300 max-w-[85%] min-w-0'>
                <MessageContent message={message} />
                {isLast && isLoading && (
                    <span className='inline-block w-1.5 h-4 bg-emerald-400 rounded-sm animate-pulse ml-0.5 align-middle' />
                )}
            </div>
        </div>
    )
}
