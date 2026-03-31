import { Hono } from 'hono'
import { generateBrief } from '@/core/ai/brief'
import { syncPortfolioDocument } from '@/core/ai/memory'
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

        // Sync portfolio to AI memory (fire-and-forget)
        if (positions.length > 0) {
            syncPortfolioDocument(positions).catch((e) =>
                console.error('[memory] portfolio sync failed:', e),
            )
        }

        let brief: Awaited<ReturnType<typeof generateBrief>>['data'] | null = null
        try {
            const prefetched = {
                ...(portfolio ? { portfolio } : {}),
                ...(macro ? { macro } : {}),
                ...(watchlist ? { watchlist } : {}),
            }
            const briefResult = await generateBrief(
                false,
                undefined,
                undefined,
                prefetched,
            )
            brief = briefResult.data
        } catch {
            // brief generation failed — return null, frontend handles gracefully
        }

        return c.json({
            success: true,
            data: { portfolio, watchlist, brief, positionSymbols },
        })
    })

export default dashboard
