/**
 * Manual test script for Trading Agent heartbeat.
 *
 * Usage: cd packages/server && bun run scripts/test-heartbeat.ts
 *
 * Prerequisites:
 * - Alpaca paper trading keys configured (ALPACA_KEY_ID, ALPACA_SECRET_KEY)
 * - PostgreSQL running with schema pushed
 * - ANTHROPIC_API_KEY configured
 */

import 'dotenv/config'
import { getAlpacaClient } from '../src/core/broker/alpaca-client'
import { prisma } from '../src/core/db'
import { getStockNews } from '../src/core/market-data/news'
import { searchStocks } from '../src/core/market-data/search'
import {
    getHistoryWithCache,
    getInfoWithCache,
    getQuoteWithCache,
} from '../src/core/market-data/sync'
import type { TradingAgentDeps } from '../src/core/trading-agent'
import { heartbeat } from '../src/core/trading-agent'

async function main() {
    console.log('=== Trading Agent Heartbeat Test ===\n')

    // 1. Check Alpaca config
    const alpacaClient = getAlpacaClient()
    if (!alpacaClient.isConfigured()) {
        console.error(
            'Alpaca is not configured. Set ALPACA_KEY_ID and ALPACA_SECRET_KEY.',
        )
        process.exit(1)
    }

    const account = await alpacaClient.getAccount()
    console.log(
        'Alpaca account:',
        account ? `$${account.equity} equity` : 'FAILED',
    )

    if (!account) {
        console.error('Cannot connect to Alpaca. Check your keys.')
        process.exit(1)
    }

    // 2. Build deps
    const toolDeps = {
        getQuoteWithCache,
        getInfoWithCache,
        getHistoryWithCache,
        getStockNews,
        searchStocks,
    }

    const deps: TradingAgentDeps = {
        alpacaClient,
        db: prisma,
        toolDeps,
    }

    // 3. Run heartbeat
    console.log('\nStarting heartbeat...\n')

    // Debug: check tools
    const { createTradingAgentTools } = await import(
        '../src/core/trading-agent/tools'
    )
    const tools = createTradingAgentTools(deps)
    console.log('Tools:', Object.keys(tools).join(', '))
    console.log('Tool count:', Object.keys(tools).length)
    const firstTool = Object.values(tools)[0] as
        | { execute?: unknown }
        | undefined
    console.log(
        'First tool type:',
        typeof firstTool,
        'has execute:',
        typeof firstTool?.execute,
    )

    const toolCtx = {
        toolCallId: 'test',
        messages: [] as never[],
        abortSignal: undefined as AbortSignal | undefined,
    }

    // Debug: test individual tools
    console.log('\n--- Testing tools directly ---')
    try {
        const memResult = await tools.memory_read.execute(
            { path: 'trading-agent/strategy.md' },
            toolCtx,
        )
        console.log('memory_read:', JSON.stringify(memResult).slice(0, 200))
    } catch (e) {
        console.error('memory_read ERROR:', e)
    }

    try {
        const pfResult = await tools.getPortfolio.execute({}, toolCtx)
        console.log('getPortfolio:', JSON.stringify(pfResult).slice(0, 200))
    } catch (e) {
        console.error('getPortfolio ERROR:', e)
    }

    const start = Date.now()
    try {
        await heartbeat(deps)
        console.log(
            `\nHeartbeat completed in ${((Date.now() - start) / 1000).toFixed(1)}s`,
        )
    } catch (error) {
        console.error('\nHeartbeat failed:', error)
    }

    // 4. Check what was persisted
    const sessions = await prisma.chatSession.findMany({
        where: { channel: 'trading-agent' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { messages: true },
    })

    if (sessions.length > 0) {
        const session = sessions[0]
        console.log(`\nSession: "${session.title}" (${session.id})`)
        if (session.messages.length > 0) {
            const content = JSON.parse(session.messages[0].content)
            console.log('\n--- Agent Response ---')
            console.log(content.text?.slice(0, 1000) || '(empty)')
            console.log(`\nSteps: ${content.stepCount ?? 'unknown'}`)
            if (content.steps) {
                console.log('\n--- Steps Detail ---')
                console.log(JSON.stringify(content.steps, null, 2))
            }
        }
    }

    // 5. Check strategy.md
    const strategy = await prisma.memoryDocument.findUnique({
        where: { path: 'trading-agent/strategy.md' },
    })
    if (strategy) {
        console.log(`\n--- strategy.md (${strategy.content.length} chars) ---`)
        console.log(strategy.content.slice(0, 500))
    } else {
        console.log('\nstrategy.md: not created')
    }

    await prisma.$disconnect()
}

main()
