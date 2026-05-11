import { describe, expect, mock, test } from 'bun:test'
import { TraceRecorder } from '@/core/ai/agent-run-trace/recorder'

describe('TraceRecorder', () => {
    test('serializes writes for the same run but not unrelated runs', async () => {
        const order: string[] = []
        const store = {
            createRecording: mock(async () => {}),
            mergeCheckpoint: mock(async (runId: string) => {
                order.push(`start:${runId}`)
                await new Promise((resolve) =>
                    setTimeout(resolve, runId === 'run-1' ? 10 : 0),
                )
                order.push(`end:${runId}`)
            }),
            markIncomplete: mock(async () => {}),
            loadByRunId: mock(async () => null),
        }
        const recorder = new TraceRecorder({ store: store as never })

        await Promise.all([
            recorder.checkpoint('run-1', 'assemble_context', {
                prompt: undefined,
            }),
            recorder.checkpoint('run-1', 'finalize', { result: undefined }),
            recorder.checkpoint('run-2', 'assemble_context', {
                prompt: undefined,
            }),
        ])

        expect(order.indexOf('end:run-1')).toBeLessThan(
            order.lastIndexOf('start:run-1'),
        )
        expect(order).toContain('start:run-2')
    })

    test('records minimal failure as complete failed trace', async () => {
        const store = {
            createRecording: mock(async () => {}),
            mergeCheckpoint: mock(async () => {}),
            markIncomplete: mock(async () => {}),
            loadByRunId: mock(async () => null),
        }
        const recorder = new TraceRecorder({ store: store as never })

        await recorder.recordMinimalFailure({
            runId: 'run-failed',
            source: 'cron_executor',
            phase: 'before_run',
            error: Object.assign(new Error('missing prompt'), {
                code: 'BAD_PAYLOAD',
            }),
            runContext: {
                source: 'cron',
                mode: 'trigger',
                agentType: 'trading-agent',
                cronJobId: 'job-1',
            },
        })

        expect(store.createRecording).toHaveBeenCalled()
        expect(store.mergeCheckpoint).toHaveBeenCalledWith(
            'run-failed',
            expect.objectContaining({
                status: 'complete',
                phase: 'before_run',
                patch: expect.objectContaining({
                    runOutcome: 'failed',
                    failure: expect.objectContaining({
                        source: 'cron_executor',
                        error: expect.objectContaining({
                            message: 'missing prompt',
                            code: 'BAD_PAYLOAD',
                        }),
                    }),
                }),
            }),
        )
    })
})
