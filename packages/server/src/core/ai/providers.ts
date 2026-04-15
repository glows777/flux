import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createXai } from '@ai-sdk/xai'
import type { EmbeddingModel, LanguageModel } from 'ai'
import { proxyFetch } from '@/core/market-data'

// ─── Types ───

const MODEL_SLOTS = ['main', 'search', 'light', 'embedding', 'xSearch'] as const
const PROVIDER_KEYS = ['openai', 'anthropic', 'embedding', 'xai'] as const

export type ModelSlot = (typeof MODEL_SLOTS)[number]
export type ProviderKey = (typeof PROVIDER_KEYS)[number]

// ─── Slot → Provider mapping ───

interface SlotConfig {
    readonly provider: ProviderKey
    readonly envKey: string
    readonly defaultModel: string
}

const SLOTS: Record<ModelSlot, SlotConfig> = {
    main: {
        provider: 'anthropic',
        envKey: 'MAIN_MODEL',
        defaultModel: 'claude-sonnet-4-6',
    },
    search: {
        provider: 'anthropic',
        envKey: 'SEARCH_MODEL',
        defaultModel: 'claude-opus-4-6',
    },
    light: {
        provider: 'openai',
        envKey: 'LIGHT_MODEL',
        defaultModel: 'google/gemini-2.5-flash',
    },
    embedding: {
        provider: 'embedding',
        envKey: 'EMBEDDING_MODEL',
        defaultModel: 'google/gemini-embedding-001',
    },
    xSearch: {
        provider: 'xai',
        envKey: 'XSEARCH_MODEL',
        defaultModel: 'grok-4-1-fast',
    },
} as const

// ─── Thinking budget ───

export const THINKING_BUDGET = Number(process.env.THINKING_BUDGET) || 10240

// ─── Lazy provider instances ───

type ProviderInstance =
    | ReturnType<typeof createOpenAI>
    | ReturnType<typeof createAnthropic>
    | ReturnType<typeof createXai>

const providerCache = new Map<ProviderKey, ProviderInstance>()

function getProviderInstance(key: ProviderKey): ProviderInstance {
    const cached = providerCache.get(key)
    if (cached) return cached

    const instance = createProviderInstance(key)
    providerCache.set(key, instance)
    return instance
}

function createProviderInstance(key: ProviderKey): ProviderInstance {
    const fetchOpt = proxyFetch as unknown as typeof globalThis.fetch

    switch (key) {
        case 'anthropic': {
            const apiKey = process.env.ANTHROPIC_API_KEY
            if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')
            return createAnthropic({
                apiKey,
                ...(process.env.ANTHROPIC_BASE_URL
                    ? { baseURL: process.env.ANTHROPIC_BASE_URL }
                    : {}),
                headers: { 'User-Agent': 'claude-code/2.1.77' },
                fetch: fetchOpt,
            })
        }
        case 'openai': {
            const apiKey = process.env.OPENAI_API_KEY
            const baseURL = process.env.OPENAI_BASE_URL
            if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
            if (!baseURL) throw new Error('OPENAI_BASE_URL is not configured')
            return createOpenAI({ apiKey, baseURL, fetch: fetchOpt })
        }
        case 'embedding': {
            const apiKey =
                process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY
            const baseURL =
                process.env.EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL
            if (!apiKey)
                throw new Error(
                    'EMBEDDING_API_KEY (or OPENAI_API_KEY) is not configured',
                )
            if (!baseURL)
                throw new Error(
                    'EMBEDDING_BASE_URL (or OPENAI_BASE_URL) is not configured',
                )
            return createOpenAI({ apiKey, baseURL, fetch: fetchOpt })
        }
        case 'xai': {
            const apiKey = process.env.XAI_API_KEY
            if (!apiKey) throw new Error('XAI_API_KEY is not configured')
            // Some proxies return usage.prompt_tokens/completion_tokens instead of
            // input_tokens/output_tokens. Patch the response to normalize.
            const xaiFetch: typeof globalThis.fetch = async (url, init) => {
                const resp = await fetchOpt(url, init)
                const ct = resp.headers.get('content-type') || ''
                if (!ct.includes('application/json')) return resp
                const text = await resp.text()
                try {
                    const json = JSON.parse(text)
                    if (json.usage && json.usage.input_tokens === undefined) {
                        json.usage.input_tokens = json.usage.prompt_tokens ?? 0
                        json.usage.output_tokens =
                            json.usage.completion_tokens ?? 0
                    }
                    return new Response(JSON.stringify(json), {
                        status: resp.status,
                        headers: resp.headers,
                    })
                } catch {
                    return new Response(text, {
                        status: resp.status,
                        headers: resp.headers,
                    })
                }
            }
            return createXai({
                apiKey,
                ...(process.env.XAI_BASE_URL
                    ? { baseURL: process.env.XAI_BASE_URL }
                    : {}),
                fetch: xaiFetch,
            })
        }
    }
}

// ─── Public API ───

function isModelSlot(value: string): value is ModelSlot {
    return MODEL_SLOTS.includes(value as ModelSlot)
}

export function getModel(slot: ModelSlot): LanguageModel
export function getModel(provider: ProviderKey, modelId: string): LanguageModel
export function getModel(
    slotOrProvider: ModelSlot | ProviderKey,
    modelId?: string,
): LanguageModel {
    // B mode: explicit provider + modelId
    if (modelId !== undefined) {
        const provider = getProviderInstance(slotOrProvider as ProviderKey)
        if (slotOrProvider === 'anthropic') {
            return (provider as ReturnType<typeof createAnthropic>)(modelId)
        }
        if (slotOrProvider === 'xai') {
            return (provider as ReturnType<typeof createXai>).responses(modelId)
        }
        // OpenAI-compatible providers need .chat() to force Chat Completions API
        return (provider as ReturnType<typeof createOpenAI>).chat(modelId)
    }

    // A mode: slot-based
    if (!isModelSlot(slotOrProvider)) {
        throw new Error(
            `Invalid model slot: ${slotOrProvider}. Use one of: ${MODEL_SLOTS.join(', ')}`,
        )
    }

    const config = SLOTS[slotOrProvider]
    const resolvedModelId = process.env[config.envKey] || config.defaultModel
    const provider = getProviderInstance(config.provider)

    if (config.provider === 'anthropic') {
        return (provider as ReturnType<typeof createAnthropic>)(resolvedModelId)
    }
    if (config.provider === 'xai') {
        return (provider as ReturnType<typeof createXai>).responses(
            resolvedModelId,
        )
    }
    return (provider as ReturnType<typeof createOpenAI>).chat(resolvedModelId)
}

export function getEmbeddingModel(): EmbeddingModel {
    const config = SLOTS.embedding
    const resolvedModelId = process.env[config.envKey] || config.defaultModel
    const provider = getProviderInstance('embedding') as ReturnType<
        typeof createOpenAI
    >
    return provider.textEmbeddingModel(resolvedModelId)
}

// ─── Test helper ───

export function resetProviders(): void {
    providerCache.clear()
}
