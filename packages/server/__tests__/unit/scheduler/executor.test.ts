import { describe, expect, mock, spyOn, test } from 'bun:test'
import type { CronJob } from '@prisma/client'
import type { AgentRunStore } from '@/core/ai/agent-run'
import type { Gateway } from '@/gateway/gateway'
import { TaskExecutor } from '@/scheduler/executor'

function createFakeAgentRunStore(
    overrides: Partial<AgentRunStore> = {},
): AgentRunStore {
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
        ...overrides,
    }
}

async function withMutedConsoleError<T>(fn: () => Promise<T>): Promise<T> {
    const consoleSpy = spyOn(console, 'error').mockImplementation(() => {})
    try {
        return await fn()
    } finally {
        consoleSpy.mockRestore()
    }
}

describe('TaskExecutor', () => {
    test('executes job by sending prompt through gateway.chat', async () => {
        const mockGateway = {
            chat: mock((input: { runId?: string }) =>
                Promise.resolve({
                    text: 'NVDA is at $120',
                    sessionId: 'sess-1',
                    runId: input.runId ?? 'run-1',
                    success: true,
                }),
            ),
        }
        const agentRunStore = createFakeAgentRunStore()

        const executor = new TaskExecutor({
            gateway: mockGateway as unknown as Gateway,
            agentRunStore,
        })
        const job = {
            id: 'job-1',
            channel: 'discord',
            userId: 'user-1',
            taskType: 'trading-agent',
            taskPayload: { prompt: 'Check NVDA price' },
            channelTarget: null,
        } as unknown as CronJob

        const result = await executor.execute(job)
        expect(result.success).toBe(true)
        expect(result.status).toBe('success')
        expect(result.runId).toEqual(expect.any(String))
        expect(result.runId.length).toBeGreaterThan(0)
        expect(result.output).toBe('NVDA is at $120')
        expect(mockGateway.chat).toHaveBeenCalledWith(
            expect.objectContaining({
                runId: result.runId,
                channel: 'cron',
                mode: 'trigger',
                agentType: 'trading-agent',
                content: 'Check NVDA price',
                sourceId: 'cron:job-1',
                userId: 'user-1',
                cronJobId: 'job-1',
                abortSignal: expect.any(AbortSignal),
            }),
        )
    })

    test('returns error when payload has no prompt', async () => {
        const agentRunStore = createFakeAgentRunStore()
        const executor = new TaskExecutor({
            gateway: {} as unknown as Gateway,
            agentRunStore,
        })
        const job = {
            id: 'job-1',
            userId: 'user-1',
            taskType: 'trading-agent',
            taskPayload: {},
        } as unknown as CronJob

        const result = await executor.execute(job)
        expect(result.success).toBe(false)
        expect(result.status).toBe('error')
        expect(result.runId).toEqual(expect.any(String))
        expect(result.runId.length).toBeGreaterThan(0)
        expect(result.error).toContain('missing prompt')
        expect(agentRunStore.createFailedRun).toHaveBeenCalledWith(
            expect.objectContaining({
                runId: result.runId,
                source: 'cron',
                mode: 'trigger',
                agentType: 'trading-agent',
                cronJobId: 'job-1',
                userId: 'user-1',
                sourceId: 'cron:job-1',
                error: expect.any(Error),
            }),
        )
    })

    test('fail-open: returns missing prompt error when failed-run ledger write rejects', async () => {
        const agentRunStore = createFakeAgentRunStore({
            createFailedRun: mock(() =>
                Promise.reject(new Error('ledger unavailable')),
            ),
        })
        const executor = new TaskExecutor({
            gateway: {} as unknown as Gateway,
            agentRunStore,
        })
        const job = {
            id: 'job-1',
            userId: 'user-1',
            taskType: 'trading-agent',
            taskPayload: {},
        } as unknown as CronJob

        const result = await withMutedConsoleError(() => executor.execute(job))

        expect(result.success).toBe(false)
        expect(result.status).toBe('error')
        expect(result.runId).toEqual(expect.any(String))
        expect(result.runId.length).toBeGreaterThan(0)
        expect(result.error).toContain('missing prompt')
    })

    test('fail-open: returns error output on gateway failure', async () => {
        const mockGateway = {
            chat: mock(() => Promise.reject(new Error('AI timeout'))),
        }
        const agentRunStore = createFakeAgentRunStore()

        const executor = new TaskExecutor({
            gateway: mockGateway as unknown as Gateway,
            agentRunStore,
        })
        const job = {
            id: 'job-1',
            channel: 'discord',
            userId: 'user-1',
            taskType: 'trading-agent',
            taskPayload: { prompt: 'Check NVDA' },
            channelTarget: null,
        } as unknown as CronJob

        const result = await executor.execute(job)
        expect(result.success).toBe(false)
        expect(result.status).toBe('error')
        expect(result.runId).toEqual(expect.any(String))
        expect(result.output).toContain('AI timeout')
        expect(agentRunStore.createFailedRun).toHaveBeenCalledWith(
            expect.objectContaining({
                runId: result.runId,
                source: 'cron',
                mode: 'trigger',
                agentType: 'trading-agent',
                cronJobId: 'job-1',
                userId: 'user-1',
                sourceId: 'cron:job-1',
                error: expect.any(Error),
            }),
        )
    })

    test('fail-open: returns gateway error when failed-run ledger write rejects', async () => {
        const mockGateway = {
            chat: mock(() => Promise.reject(new Error('AI timeout'))),
        }
        const agentRunStore = createFakeAgentRunStore({
            createFailedRun: mock(() =>
                Promise.reject(new Error('ledger unavailable')),
            ),
        })

        const executor = new TaskExecutor({
            gateway: mockGateway as unknown as Gateway,
            agentRunStore,
        })
        const job = {
            id: 'job-1',
            channel: 'discord',
            userId: 'user-1',
            taskType: 'trading-agent',
            taskPayload: { prompt: 'Check NVDA' },
            channelTarget: null,
        } as unknown as CronJob

        const result = await withMutedConsoleError(() => executor.execute(job))

        expect(result.success).toBe(false)
        expect(result.status).toBe('error')
        expect(result.runId).toEqual(expect.any(String))
        expect(result.output).toContain('AI timeout')
        expect(result.error).toContain('AI timeout')
        expect(result.output).not.toContain('ledger unavailable')
        expect(result.error).not.toContain('ledger unavailable')
    })

    test('returns timeout and aborts gateway signal', async () => {
        let signal: AbortSignal | undefined
        const mockGateway = {
            chat: mock(
                (input: { abortSignal?: AbortSignal }) =>
                    new Promise(() => {
                        signal = input.abortSignal
                    }),
            ),
        }
        const agentRunStore = createFakeAgentRunStore()
        const executor = new TaskExecutor({
            gateway: mockGateway as unknown as Gateway,
            agentRunStore,
            timeoutMs: 1,
        })
        const job = {
            id: 'job-1',
            channel: 'discord',
            userId: 'user-1',
            taskType: 'trading-agent',
            taskPayload: { prompt: 'Check NVDA' },
            channelTarget: null,
        } as unknown as CronJob

        const result = await executor.execute(job)

        expect(result.status).toBe('timeout')
        expect(result.success).toBe(false)
        expect(result.runId).toEqual(expect.any(String))
        expect(signal?.aborted).toBe(true)
        expect(agentRunStore.createFailedRun).toHaveBeenCalledWith(
            expect.objectContaining({
                runId: result.runId,
                source: 'cron',
                mode: 'trigger',
                cronJobId: 'job-1',
                code: 'TIMEOUT',
            }),
        )
    })

    test('fail-open: returns timeout when failed-run ledger write rejects', async () => {
        let signal: AbortSignal | undefined
        const mockGateway = {
            chat: mock(
                (input: { abortSignal?: AbortSignal }) =>
                    new Promise(() => {
                        signal = input.abortSignal
                    }),
            ),
        }
        const agentRunStore = createFakeAgentRunStore({
            createFailedRun: mock(() =>
                Promise.reject(new Error('ledger unavailable')),
            ),
        })
        const executor = new TaskExecutor({
            gateway: mockGateway as unknown as Gateway,
            agentRunStore,
            timeoutMs: 1,
        })
        const job = {
            id: 'job-1',
            channel: 'discord',
            userId: 'user-1',
            taskType: 'trading-agent',
            taskPayload: { prompt: 'Check NVDA' },
            channelTarget: null,
        } as unknown as CronJob

        const result = await withMutedConsoleError(() => executor.execute(job))

        expect(result.status).toBe('timeout')
        expect(result.success).toBe(false)
        expect(result.runId).toEqual(expect.any(String))
        expect(result.error).toContain('Execution timed out')
        expect(signal?.aborted).toBe(true)
    })

    test('fail-open: returns trigger failure when failed-run ledger write rejects', async () => {
        const mockGateway = {
            chat: mock(() =>
                Promise.resolve({
                    success: false,
                    runId: 'run-trigger',
                    sessionId: 'session-1',
                    text: '',
                    error: 'trigger failed',
                }),
            ),
        }
        const agentRunStore = createFakeAgentRunStore({
            createFailedRun: mock(() =>
                Promise.reject(new Error('ledger unavailable')),
            ),
        })

        const executor = new TaskExecutor({
            gateway: mockGateway as unknown as Gateway,
            agentRunStore,
        })
        const job = {
            id: 'job-1',
            channel: 'discord',
            userId: 'user-1',
            taskType: 'trading-agent',
            taskPayload: { prompt: 'Check NVDA' },
            channelTarget: null,
        } as unknown as CronJob

        const result = await withMutedConsoleError(() => executor.execute(job))

        expect(result.success).toBe(false)
        expect(result.status).toBe('error')
        expect(result.runId).toBe('run-trigger')
        expect(result.error).toBe('trigger failed')
    })
})
