import { Hono } from 'hono'
import {
    type AgentRunTraceStore,
    createPrismaAgentRunTraceStore,
} from '@/core/ai/agent-run-trace'

interface RunsRouteDeps {
    traceStore?: AgentRunTraceStore
    isEnabled?: () => boolean
}

let defaultTraceStore: AgentRunTraceStore | undefined

function isTraceApiEnabled() {
    return (
        process.env.NODE_ENV !== 'production' ||
        process.env.FLUX_ENABLE_TRACE_API === '1'
    )
}

async function getTraceStore(deps: RunsRouteDeps) {
    if (deps.traceStore) return deps.traceStore
    if (!defaultTraceStore) {
        const { prisma } = await import('@/core/db')
        defaultTraceStore = createPrismaAgentRunTraceStore(prisma as never)
    }
    return defaultTraceStore
}

function serializeRunDates<
    T extends { startedAt: Date; finishedAt: Date | null },
>(run: T) {
    return {
        ...run,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
    }
}

export function createRunsRoutes(deps: RunsRouteDeps = {}) {
    const enabled = deps.isEnabled ?? isTraceApiEnabled

    return new Hono().get('/:runId/trace', async (c) => {
        if (!enabled()) {
            return c.json({ success: false, error: 'Run trace not found' }, 404)
        }

        const runId = c.req.param('runId')
        const traceStore = await getTraceStore(deps)
        const record = await traceStore.loadRecordByRunId(runId)

        if (!record) {
            return c.json({ success: false, error: 'Run trace not found' }, 404)
        }

        return c.json({
            success: true,
            data: {
                run: serializeRunDates(record.run),
                trace: record.trace,
            },
        })
    })
}
