import type { HistoryPoint } from '../common/types'

export function toUtcDay(date: Date): Date {
    return new Date(
        Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
        ),
    )
}

function toUtcDayKey(date: Date): string {
    return toUtcDay(date).toISOString()
}

export function normalizeHistoryPointToUtcDay(
    point: HistoryPoint,
): HistoryPoint {
    return {
        ...point,
        date: toUtcDay(point.date),
    }
}

export function dedupeHistoryPointsByUtcDay(
    points: readonly HistoryPoint[],
): HistoryPoint[] {
    const byDay = new Map<string, HistoryPoint>()

    for (const point of points) {
        const key = toUtcDayKey(point.date)
        const existing = byDay.get(key)

        if (!existing || existing.date.getTime() <= point.date.getTime()) {
            byDay.set(key, point)
        }
    }

    return [...byDay.values()]
        .map(normalizeHistoryPointToUtcDay)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
}
