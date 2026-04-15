import { Loader2, Send } from 'lucide-react'

interface ContextInputProps {
    readonly value: string
    readonly onChange: (value: string) => void
    readonly onSend: () => void
    readonly isLoading: boolean
    readonly placeholder?: string
}

export function ContextInput({
    value,
    onChange,
    onSend,
    isLoading,
    placeholder = '发送消息...',
}: ContextInputProps) {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing && !isLoading) {
            e.preventDefault()
            onSend()
        }
    }

    return (
        <div className='p-4 bg-white/[0.01] border-t border-white/5'>
            <div className='relative group'>
                <input
                    type='text'
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading}
                    className='w-full bg-black border border-white/10 rounded-xl py-3 pl-4 pr-10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/30 transition-all group-hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed'
                />
                <button
                    type='button'
                    onClick={onSend}
                    disabled={isLoading || !value.trim()}
                    className='absolute right-3 top-3 p-1.5 rounded-lg bg-white/10 text-slate-400 transition-colors hover:bg-emerald-500/20 hover:text-emerald-400 disabled:opacity-50 disabled:pointer-events-none'
                >
                    {isLoading ? (
                        <Loader2 size={12} className='animate-spin' />
                    ) : (
                        <Send size={12} />
                    )}
                </button>
            </div>
        </div>
    )
}
