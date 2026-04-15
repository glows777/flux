import { describe, expect, mock, test } from 'bun:test'
import type { CronJob } from '@prisma/client'
import type { Gateway } from '@/gateway/gateway'
import { TaskExecutor } from '@/scheduler/executor'

describe('TaskExecutor', () => {
    test('executes job by sending prompt through gateway.chat', async () => {
        const mockGateway = {
            chat: mock(() =>
                Promise.resolve({
                    text: 'NVDA is at $120',
                    sessionId: 'sess-1',
                    success: true,
                }),
            ),
        }

        const executor = new TaskExecutor({
            gateway: mockGateway as unknown as Gateway,
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
        expect(result.output).toBe('NVDA is at $120')
        expect(mockGateway.chat).toHaveBeenCalledWith({
            channel: 'cron',
            mode: 'trigger',
            agentType: 'trading-agent',
            content: 'Check NVDA price',
            sourceId: 'cron:job-1',
            userId: 'user-1',
        })
    })

    test('returns error when payload has no prompt', async () => {
        const executor = new TaskExecutor({ gateway: {} as unknown as Gateway })
        const job = { id: 'job-1', taskPayload: {} } as unknown as CronJob

        const result = await executor.execute(job)
        expect(result.success).toBe(false)
        expect(result.error).toContain('missing prompt')
    })

    test('fail-open: returns error output on gateway failure', async () => {
        const mockGateway = {
            chat: mock(() => Promise.reject(new Error('AI timeout'))),
        }

        const executor = new TaskExecutor({
            gateway: mockGateway as unknown as Gateway,
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
        expect(result.output).toContain('AI timeout')
    })
})
