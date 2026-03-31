import {
    getHistoryRaw as defaultGetHistoryRaw,
    getInfo as defaultGetInfo,
    getQuote as defaultGetQuote,
    type CompanyOverview,
    type HistoryPoint,
    type Quote,
} from '@/core/market-data'
import { generateText } from 'ai'
import type { LanguageModel } from 'ai'
import { getModel } from './providers'
import { buildReportPrompt } from './prompts'
import type { ReportContext } from './types'

export interface ReportDeps {
    readonly getQuote: (symbol: string) => Promise<Quote>
    readonly getHistoryRaw: (
        symbol: string,
        days: number,
    ) => Promise<HistoryPoint[]>
    readonly getInfo: (symbol: string) => Promise<CompanyOverview>
    readonly model: LanguageModel
}

function getDefaultDeps(): ReportDeps {
    return {
        getQuote: defaultGetQuote,
        getHistoryRaw: defaultGetHistoryRaw,
        getInfo: defaultGetInfo,
        model: getModel('main'),
    }
}

/**
 * 收集研报所需的上下文数据
 */
async function collectContext(
    symbol: string,
    deps: ReportDeps,
): Promise<ReportContext> {
    const [quote, history, info] = await Promise.all([
        deps.getQuote(symbol),
        deps.getHistoryRaw(symbol, 30),
        deps.getInfo(symbol),
    ])

    return {
        symbol,
        name: info.name,
        price: quote.price,
        change: quote.change,
        history,
        metrics: {
            pe: info.pe,
            marketCap: info.marketCap,
            eps: info.eps,
            dividendYield: info.dividendYield,
            sector: info.sector,
        },
    }
}

/**
 * 生成 AI 研报
 */
export async function generateReport(
    symbol: string,
    deps?: ReportDeps,
): Promise<string> {
    const resolvedDeps = deps ?? getDefaultDeps()
    const context = await collectContext(symbol, resolvedDeps)
    const prompt = buildReportPrompt(context)

    const result = await generateText({
        model: resolvedDeps.model,
        prompt,
        maxOutputTokens: 1024,
        temperature: 0.7,
    })

    return result.text
}
