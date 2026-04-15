interface DeleteConfirmPopoverProps {
    readonly symbol: string
    readonly onConfirm: () => void
    readonly onCancel: () => void
    readonly label?: string
}

export function DeleteConfirmPopover({
    symbol,
    onConfirm,
    onCancel,
    label = '持仓',
}: DeleteConfirmPopoverProps) {
    return (
        <div
            data-testid={`delete-confirm-${symbol}`}
            className='flex items-center justify-between animate-fade-in'
        >
            <span className='text-xs text-slate-400'>
                确定删除{' '}
                <span className='font-medium text-white'>{symbol}</span> {label}
                ？
            </span>
            <div className='flex gap-2'>
                <button
                    type='button'
                    onClick={onCancel}
                    className='px-2.5 py-1 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-all'
                >
                    取消
                </button>
                <button
                    type='button'
                    onClick={onConfirm}
                    className='px-2.5 py-1 rounded-lg text-xs text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-all'
                >
                    确认删除
                </button>
            </div>
        </div>
    )
}
