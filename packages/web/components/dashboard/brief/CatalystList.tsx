import type { CatalystItem } from '@flux/shared'

interface CatalystListProps {
    items: CatalystItem[]
}

export function CatalystList({ items }: CatalystListProps) {
    if (items.length === 0) return null

    return (
        <div>
            <h3 className="text-white text-sm font-medium mb-4">
                近期催化剂
            </h3>

            <div className="border-l-2 border-white/10 space-y-4">
                {items.map((item) => (
                    <div key={`${item.symbol}-${item.date}`} className="pl-4">
                        <div className="flex items-center gap-1">
                            <span className="text-white text-sm font-medium">
                                {item.symbol}
                            </span>
                            <span className="text-slate-400 text-sm">
                                {item.event}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-slate-500 text-xs">
                                {item.date}
                            </span>
                            <span className="text-slate-500 text-xs">·</span>
                            <span className="text-slate-400 text-xs">
                                {item.daysAway} 天后
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            <p className="text-slate-600 text-xs mt-3">
                仅显示已有缓存数据
            </p>
        </div>
    )
}
