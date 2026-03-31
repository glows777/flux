const SPOTLIGHT_COUNT = 3
const CATALYST_COUNT = 3
const BODY_LINES = 2

function SpotlightCardSkeleton() {
    return (
        <div className='bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-3'>
            <div className='flex items-center justify-between'>
                <div className='h-4 w-16 bg-white/5 rounded animate-pulse' />
                <div className='h-4 w-12 bg-white/5 rounded animate-pulse' />
            </div>
            <div className='h-3 w-24 bg-white/5 rounded animate-pulse' />
            <div className='border-t border-white/5' />
            {Array.from({ length: BODY_LINES }, (_, i) => (
                <div
                    key={i}
                    className='h-3 w-full bg-white/5 rounded animate-pulse'
                />
            ))}
        </div>
    )
}

function CatalystsSkeleton() {
    return (
        <div className='space-y-3'>
            <div className='h-4 w-20 bg-white/5 rounded animate-pulse' />
            <div className='border-l-2 border-white/10 pl-4 space-y-4'>
                {Array.from({ length: CATALYST_COUNT }, (_, i) => (
                    <div key={i} className='space-y-1'>
                        <div className='h-3 w-28 bg-white/5 rounded animate-pulse' />
                        <div className='h-3 w-20 bg-white/5 rounded animate-pulse' />
                    </div>
                ))}
            </div>
        </div>
    )
}

export function BriefSkeleton() {
    return (
        <div className='space-y-6'>
            {/* Macro subtitle */}
            <div className='h-4 w-3/4 bg-white/5 rounded animate-pulse' />

            {/* Spotlight + Catalysts grid */}
            <div className='grid grid-cols-1 md:grid-cols-12 gap-6'>
                {/* Spotlight column */}
                <div className='md:col-span-8 space-y-4'>
                    {Array.from({ length: SPOTLIGHT_COUNT }, (_, i) => (
                        <SpotlightCardSkeleton key={i} />
                    ))}
                </div>

                {/* Catalysts column */}
                <div className='md:col-span-4'>
                    <CatalystsSkeleton />
                </div>
            </div>
        </div>
    )
}
