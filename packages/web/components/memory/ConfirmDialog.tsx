'use client'

interface ConfirmDialogProps {
    readonly open: boolean
    readonly title: string
    readonly message: string
    readonly confirmLabel?: string
    readonly destructive?: boolean
    readonly onConfirm: () => void
    readonly onCancel: () => void
}

export function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel,
    destructive = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    if (!open) return null

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center'>
            <button
                type='button'
                className='absolute inset-0 bg-black/60'
                onClick={onCancel}
                aria-label='关闭对话框'
            />
            <div className='relative bg-[#0a0a0a] border border-white/10 rounded-lg p-5 max-w-sm w-full mx-4'>
                <h3 className='text-sm font-medium text-white mb-1'>{title}</h3>
                <p className='text-xs text-slate-400 mb-4'>{message}</p>
                <div className='flex justify-end gap-2'>
                    <button
                        type='button'
                        onClick={onCancel}
                        className='px-3 py-1 text-xs rounded text-slate-400 hover:text-white transition-colors'
                    >
                        取消
                    </button>
                    <button
                        type='button'
                        onClick={onConfirm}
                        className={`px-3 py-1 text-xs rounded text-white transition-colors ${
                            destructive
                                ? 'bg-rose-600 hover:bg-rose-500'
                                : 'bg-emerald-600 hover:bg-emerald-500'
                        }`}
                    >
                        {confirmLabel ?? '确认'}
                    </button>
                </div>
            </div>
        </div>
    )
}
