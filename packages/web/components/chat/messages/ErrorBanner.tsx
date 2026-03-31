import { AlertCircle, RotateCcw } from 'lucide-react'

export function ErrorBanner({ error, onReload }: { readonly error: Error; readonly onReload: () => void }) {
    return (
        <div className='flex gap-3'>
            <div className='w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0'>
                <AlertCircle size={14} className='text-red-400' />
            </div>
            <div className='p-3 bg-red-500/10 rounded-2xl rounded-tl-none border border-red-500/10 text-sm text-red-300 flex items-center gap-3'>
                <span>{error.message}</span>
                <button
                    type='button'
                    onClick={onReload}
                    className='flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors shrink-0'
                >
                    <RotateCcw size={12} />
                    重试
                </button>
            </div>
        </div>
    )
}
