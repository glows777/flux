import { describe, expect, test, mock } from 'bun:test'
import { TaskExecutor } from '@/scheduler/executor'

describe('TaskExecutor', () => {
    test('executes job by sending prompt through gateway.chat', async () => {
        const mockConsumeStream = mock(() => Promise.resolve({
            text: 'NVDA is at $120',
            responseMessage: { id: 'r1', role: 'assistant', parts: [] },
            toolCalls: [],
            usage: { inputTokens: 100, outputTokens: 50 },
        }))

        const mockGateway = {
            chat: mock(() => Promise.resolve({
                streamResult: {},
                sessionId: 'session-1',
                consumeStream: mockConsumeStream,
                finalize: mock(() => Promise.resolve()),
            })),
        }

        const executor = new TaskExecutor({ gateway: mockGateway as any })
        const job = {
            id: 'job-1',
            channel: 'discord',
            userId: 'user-1',
            taskType: 'trading-agent',
            taskPayload: { prompt: 'Check NVDA price' },
        } as any

        const result = await executor.execute(job)
        expect(result.success).toBe(true)
        expect(result.output).toBe('NVDA is at $120')
        expect(mockGateway.chat).toHaveBeenCalledWith({
            channel: 'cron',
            agentType: 'trading-agent',
            content: 'Check NVDA price',
            channelId: 'cron:job-1',
            userId: 'user-1',
        })
    })

    test('returns error when payload has no prompt', async () => {
        const executor = new TaskExecutor({ gateway: {} as any })
        const job = { id: 'job-1', taskPayload: {} } as any

        const result = await executor.execute(job)
        expect(result.success).toBe(false)
        expect(result.error).toContain('missing prompt')
    })

    test('fail-open: returns error output on gateway failure', async () => {
        const mockGateway = {
            chat: mock(() => Promise.reject(new Error('AI timeout'))),
        }

        const executor = new TaskExecutor({ gateway: mockGateway as any })
        const job = {
            id: 'job-1',
            channel: 'discord',
            userId: 'user-1',
            taskType: 'trading-agent',
            taskPayload: { prompt: 'Check NVDA' },
        } as any

        const result = await executor.execute(job)
        expect(result.success).toBe(false)
        expect(result.output).toContain('AI timeout')
    })
})
