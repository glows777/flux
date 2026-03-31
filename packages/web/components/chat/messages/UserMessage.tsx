export function UserMessage({ content }: { readonly content: string }) {
    return (
        <div className='flex justify-end'>
            <div className='p-3 bg-emerald-500/15 rounded-2xl rounded-tr-none border border-emerald-500/10 text-sm text-white max-w-[85%] break-words'>
                {content}
            </div>
        </div>
    )
}
