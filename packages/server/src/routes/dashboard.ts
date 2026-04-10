import { Hono } from 'hono'
import { getAlpacaClient } from '@/core/broker/alpaca-client'
import { calculateSummary, mapAlpacaPositionToHoldingItem } from '@/core/broker/portfolio-calc'
import { getWatchlistItems } from '@/core/api/watchlist'
import { findVixFromMacro, getMacro, getInfo } from '@/core/market-data'
import type { HoldingItem, PortfolioData } from '@flux/shared'

const dashboard = new Hono()
    .get('/', async (c) => {
        const alpaca = getAlpacaClient()

        const [macroResult, watchlistResult, accountResult, positionsResult] =
            await Promise.allSettled([
                getMacro(),
                getWatchlistItems(),
                alpaca.getAccount(),
                alpaca.getPositions(),
            ])

        const macro = macroResult.status === 'fulfilled' ? macroResult.value : null
        const watchlist = watchlistResult.status === 'fulfilled' ? watchlistResult.value : null
        const account = accountResult.status === 'fulfilled' ? accountResult.value : null
        const positions = positionsResult.status === 'fulfilled' ? positionsResult.value : []

        let portfolio: PortfolioData | null = null
        const positionSymbols: string[] = positions.map(p => p.symbol)

        if (account) {
            const nameResults = await Promise.allSettled(
                positions.map(p => getInfo(p.symbol)),
            )
            const holdingItems: HoldingItem[] = positions.map((p, i) => {
                const name = nameResults[i].status === 'fulfilled'
                    ? nameResults[i].value.name ?? null : null
                return mapAlpacaPositionToHoldingItem(p, name)
            })

            const vixData = macro ? findVixFromMacro(macro) : null
            const vix = vixData ? parseFloat(vixData.val) || 0 : 0
            portfolio = { holdings: holdingItems, summary: calculateSummary(holdingItems, vix) }
        }

        return c.json({
            success: true,
            data: { portfolio, watchlist, positionSymbols },
        })
    })

export default dashboard
