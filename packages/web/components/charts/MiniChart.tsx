'use client'

import { Line, LineChart, ResponsiveContainer } from 'recharts'

interface MiniChartProps {
    data: number[]
    color: string // '#34d399' (green) or '#f43f5e' (red)
    className?: string
}

/**
 * 迷你趋势图
 * 纯趋势线，无坐标轴
 */
export function MiniChart({ data, color, className }: MiniChartProps) {
    const chartData = data.map((v) => ({ v }))

    return (
        <div className={className ?? 'h-10 w-24'}>
            <ResponsiveContainer
                width='100%'
                height='100%'
                initialDimension={{ width: 1, height: 1 }}
            >
                <LineChart data={chartData}>
                    <Line
                        type='monotone'
                        dataKey='v'
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}
