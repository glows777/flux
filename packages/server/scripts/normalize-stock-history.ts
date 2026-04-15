import { prisma } from '../src/core/db'

interface DuplicateCountRow {
    duplicate_rows: number
}

interface NonNormalizedCountRow {
    non_normalized_rows: number
}

async function countDuplicateRows(): Promise<number> {
    const rows = await prisma.$queryRawUnsafe<DuplicateCountRow[]>(`
        select coalesce(sum(grouped.row_count - 1), 0)::int as duplicate_rows
        from (
            select count(*) as row_count
            from "StockHistory"
            group by symbol, date_trunc('day', date)
            having count(*) > 1
        ) grouped
    `)

    return rows[0]?.duplicate_rows ?? 0
}

async function countNonNormalizedRows(): Promise<number> {
    const rows = await prisma.$queryRawUnsafe<NonNormalizedCountRow[]>(`
        select count(*)::int as non_normalized_rows
        from "StockHistory"
        where date <> date_trunc('day', date)
    `)

    return rows[0]?.non_normalized_rows ?? 0
}

async function main() {
    const duplicateRowsBefore = await countDuplicateRows()
    const nonNormalizedRowsBefore = await countNonNormalizedRows()

    const deletedRows = await prisma.$executeRawUnsafe(`
        with ranked as (
            select
                id,
                row_number() over (
                    partition by symbol, date_trunc('day', date)
                    order by date desc, "fetchedAt" desc, id desc
                ) as row_num
            from "StockHistory"
        )
        delete from "StockHistory" history
        using ranked
        where history.id = ranked.id
          and ranked.row_num > 1
    `)

    const normalizedRows = await prisma.$executeRawUnsafe(`
        update "StockHistory"
        set date = date_trunc('day', date)
        where date <> date_trunc('day', date)
    `)

    const duplicateRowsAfter = await countDuplicateRows()
    const nonNormalizedRowsAfter = await countNonNormalizedRows()

    console.log(
        JSON.stringify(
            {
                duplicateRowsBefore,
                nonNormalizedRowsBefore,
                deletedRows,
                normalizedRows,
                duplicateRowsAfter,
                nonNormalizedRowsAfter,
            },
            null,
            2,
        ),
    )
}

try {
    await main()
} finally {
    await prisma.$disconnect()
}
