/**
 * Phase 3 Step 3: L2 Earnings AI Analysis Service
 *
 * Flow: fetch transcript → build prompt → call AI → parse JSON → validate
 * Uses dependency injection for testability.
 */

import { z } from 'zod'
import { generateText } from 'ai'
import type { LanguageModel } from 'ai'
import { getModel } from '@/core/ai/providers'
import { getTranscript as defaultGetTranscript } from './fmp-client'
import { buildL2AnalysisPrompt } from './l2-prompt'
import { getUploadedTranscript as defaultGetUploadedTranscript } from './transcript-service'
import type { EarningsL1, EarningsL2, FmpTranscript } from './types'
import { FmpError } from './types'

const L2_MAX_TOKENS = 4096
const L2_TEMPERATURE = 0.1

// ─── Zod Schema for AI output validation ───

const EarningsL2Schema = z.object({
    symbol: z.string(),
    period: z.string(),
    tldr: z.string().min(1),
    guidance: z.object({
        nextQuarterRevenue: z.string(),
        fullYearAdjustment: z.enum(['上调', '维持', '下调', '未提及']),
        keyQuote: z.string(),
        signal: z.enum(['正面', '中性', '谨慎']),
    }),
    segments: z.array(
        z.object({
            name: z.string(),
            value: z.string(),
            yoy: z.string(),
            comment: z.string(),
        }),
    ),
    managementSignals: z.object({
        tone: z.enum(['乐观', '中性', '谨慎']),
        keyPhrases: z.array(z.string()),
        quotes: z.array(
            z.object({
                en: z.string(),
                cn: z.string(),
            }),
        ),
        analystFocus: z.array(z.string()),
    }),
    suggestedQuestions: z.array(z.string()),
})

// ─── Dependency Injection ───

export interface L2ServiceDeps {
    readonly getTranscript: (symbol: string, year: number, quarter: number) => Promise<FmpTranscript[]>
    readonly model: LanguageModel
    readonly getUploadedTranscript?: (symbol: string, year: number, quarter: number) => Promise<string | null>
}

function getDefaultDeps(): L2ServiceDeps {
    return {
        getTranscript: (symbol, year, quarter) => defaultGetTranscript(symbol, year, quarter),
        model: getModel('main'),
        getUploadedTranscript: (symbol, year, quarter) => defaultGetUploadedTranscript(symbol, year, quarter),
    }
}

// ─── Code Fence Stripping ───

/**
 * Strip markdown code fences from AI response.
 * Handles: ```json\n...\n```, ```\n...\n```, and raw JSON.
 */
export function stripCodeFences(text: string): string {
    const trimmed = text.trim()

    // Match ```json ... ``` or ``` ... ```
    const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
    if (fenceMatch) {
        return fenceMatch[1].trim()
    }

    return trimmed
}

// ─── Transcript Acquisition ───

/**
 * Fetch transcript content with FMP → uploaded fallback chain.
 *
 * When getUploadedTranscript is not provided, preserves original
 * FMP-only behavior (re-throws FMP errors directly).
 * When provided, catches FMP failures and tries the uploaded fallback.
 */
async function fetchTranscriptContent(
    symbol: string,
    year: number,
    quarter: number,
    getTranscript: L2ServiceDeps['getTranscript'],
    getUploadedTranscript?: L2ServiceDeps['getUploadedTranscript'],
): Promise<string> {
    try {
        // Try FMP first
        let transcripts: FmpTranscript[]
        try {
            transcripts = await getTranscript(symbol, year, quarter)
        } catch (error) {
            if (error instanceof FmpError) throw error
            throw new FmpError(
                `Failed to fetch transcript: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'API_ERROR',
            )
        }

        if (transcripts.length === 0) {
            throw new FmpError(
                `No earnings call transcript found for ${symbol} Q${quarter} ${year}`,
                'NOT_FOUND',
            )
        }

        return transcripts[0].content
    } catch (error) {
        // No fallback available — preserve original error behavior
        if (!getUploadedTranscript) throw error

        // Try uploaded transcript fallback
        let uploaded: string | null = null
        try {
            uploaded = await getUploadedTranscript(symbol, year, quarter)
        } catch {
            // Graceful: uploaded retrieval failed
        }

        if (uploaded) return uploaded

        throw new FmpError(
            `No earnings call transcript found for ${symbol} Q${quarter} ${year}. You can manually upload a transcript via PUT /api/stocks/${symbol}/earnings/transcript`,
            'NOT_FOUND',
        )
    }
}

// ─── Main Service ───

/**
 * Generate L2 AI analysis from earnings call transcript.
 *
 * Transcript acquisition: FMP → uploaded fallback → error with upload hint.
 *
 * @param symbol Stock ticker symbol
 * @param year Fiscal year
 * @param quarter Quarter 1-4
 * @param l1Data L1 hard data (used in prompt for context)
 * @param deps Injectable dependencies for testing
 * @returns Validated EarningsL2
 * @throws FmpError NOT_FOUND if no transcript available
 * @throws FmpError PARSE_ERROR if AI output fails validation
 * @throws FmpError API_ERROR if AI call fails
 */
export async function getEarningsL2(
    symbol: string,
    year: number,
    quarter: number,
    l1Data: EarningsL1,
    deps?: L2ServiceDeps,
): Promise<EarningsL2> {
    const { getTranscript, model, getUploadedTranscript } = deps ?? getDefaultDeps()

    // 1. Fetch transcript — FMP primary, uploaded fallback
    const transcriptContent = await fetchTranscriptContent(
        symbol, year, quarter, getTranscript, getUploadedTranscript,
    )

    // 2. Build prompt
    const prompt = buildL2AnalysisPrompt(l1Data, transcriptContent)

    // 3. Call AI
    let rawResponse: string
    try {
        const result = await generateText({ model, prompt, maxOutputTokens: L2_MAX_TOKENS, temperature: L2_TEMPERATURE })
        rawResponse = result.text
    } catch (error) {
        if (error instanceof FmpError) throw error
        throw new FmpError(
            `AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'API_ERROR',
        )
    }

    // 4. Parse JSON (strip code fences first)
    const jsonString = stripCodeFences(rawResponse)

    let parsed: unknown
    try {
        parsed = JSON.parse(jsonString)
    } catch {
        throw new FmpError(
            'Failed to parse AI response as JSON',
            'PARSE_ERROR',
        )
    }

    // 5. Validate with Zod
    const validated = EarningsL2Schema.safeParse(parsed)

    if (!validated.success) {
        throw new FmpError(
            `AI response validation failed: ${validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
            'PARSE_ERROR',
        )
    }

    return validated.data as EarningsL2
}
