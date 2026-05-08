import { describe, expect, mock, test } from 'bun:test'
import type { AgentRunStore } from '@/core/ai/agent-run'

const mockConvertToModelMessages = mock(async (messages: unknown[]) => messages)
const mockStepCountIs = mock((_count: number) => () => false)

const mockStreamText = mock(() => ({
    text: Promise.resolve('mock text'),
    usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
    totalUsage: Promise.resolve(undefined),
    providerMetadata: Promise.resolve(undefined),
    steps: Promise.resolve([]),
    toUIMessageStream: (opts?: {
        generateMessageId?: () => string
        onFinish?: (payload: {
            responseMessage: {
                id: string
                role: 'assistant'
                parts: Array<{ type: 'text'; text: string }>
            }
        }) => void
    }) =>
        new ReadableStream({
            start(controller) {
                const responseMessage = {
                    id: opts?.generateMessageId?.() ?? '',
                    role: 'assistant' as const,
                    parts: [{ type: 'text' as const, text: 'mock text' }],
                }
                opts?.onFinish?.({ responseMessage })
                controller.close()
            },
        }),
    toUIMessageStreamResponse: (_opts?: unknown) =>
        new Response('data: test\n\n', {
            headers: { 'Content-Type': 'text/event-stream' },
        }),
}))

mock.module('ai', async () => ({
    convertToModelMessages: mockConvertToModelMessages,
    stepCountIs: mockStepCountIs,
    streamText: mockStreamText,
}))

function createFakeAgentRunStore(): AgentRunStore {
    return {
        createRunningRun: mock(() => Promise.resolve()),
        createFailedRun: mock(async (input) => ({
            runId: input.runId ?? 'generated-failed-run',
        })),
        attachSession: mock(() => Promise.resolve()),
        succeedIfRunning: mock(() => Promise.resolve()),
        failIfRunning: mock(() => Promise.resolve()),
        recordWarnings: mock(() => Promise.resolve()),
        reconcileStaleRunningRuns: mock(() => Promise.resolve({ count: 0 })),
    }
}

async function loadCreateAIRuntime() {
    return (await import('../../../../src/core/ai/runtime/create'))
        .createAIRuntime
}

describe('consumeStream message ids', () => {
    test('generateMessageId is forwarded for trigger channels', async () => {
        const createAIRuntime = await loadCreateAIRuntime()
        const runtime = await createAIRuntime({
            model: { modelId: 'gpt-4.1-mini' } as never,
            plugins: [],
            agentRunStore: createFakeAgentRunStore(),
        })

        const output = await runtime.chat({
            messages: [],
            channel: 'cron',
            mode: 'trigger',
            agentType: 'auto-trading-agent',
        })

        const consumed = await output.consumeStream()

        expect(consumed.responseMessage.id).not.toBe('')
    })
})
