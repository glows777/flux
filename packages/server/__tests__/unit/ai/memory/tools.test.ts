import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { StoreDeps } from '@/core/ai/memory/store'
import { createHistoryTool, createMemoryTools } from '@/core/ai/memory/tools'

// ─── Mock Store Deps ───

function createMockDeps() {
    return {
        db: {
            memoryVersion: {
                findFirst: mock(() => Promise.resolve(null)),
                findMany: mock(() => Promise.resolve([])),
                create: mock(() => Promise.resolve({ id: 'v1' })),
            },
        } as unknown as StoreDeps['db'],
    }
}

let deps: ReturnType<typeof createMockDeps>
const toolCtx = {
    toolCallId: 'memory-test',
    messages: [] as never[],
    abortSignal: undefined as AbortSignal | undefined,
}

beforeEach(() => {
    deps = createMockDeps()
})

// ─── update_core_memory ───

describe('update_core_memory', () => {
    it('returns success when write succeeds', async () => {
        const tools = createMemoryTools(deps)
        const result = await tools.update_core_memory.execute(
            { slot: 'user_profile', content: '成长股偏好', reason: '用户更新' },
            toolCtx,
        )
        expect(result.success).toBe(true)
        expect(deps.db.memoryVersion.create).toHaveBeenCalled()
    })

    it('returns error (not throw) when content too long', async () => {
        const tools = createMemoryTools(deps)
        const tooLong = 'X'.repeat(501) // user_profile limit is 500
        const result = await tools.update_core_memory.execute(
            { slot: 'user_profile', content: tooLong },
            toolCtx,
        )
        expect(result.success).toBe(false)
        expect((result as { error: string }).error).toContain('501')
        expect((result as { error: string }).error).toContain('500')
    })
})

// ─── save_lesson ───

describe('save_lesson', () => {
    it('appends lesson to empty slot with date prefix', async () => {
        deps.db.memoryVersion.findFirst.mockResolvedValueOnce(null) // no existing content
        const tools = createMemoryTools(deps)
        const result = await tools.save_lesson.execute(
            { lesson: '不要追涨' },
            toolCtx,
        )
        expect(result.success).toBe(true)
        const call = deps.db.memoryVersion.create.mock.calls[0][0]
        expect(call.data.slot).toBe('lessons')
        expect(call.data.content).toMatch(/^\[\d{4}-\d{2}-\d{2}\] 不要追涨$/)
        expect(call.data.author).toBe('agent')
    })

    it('appends lesson to existing content', async () => {
        deps.db.memoryVersion.findFirst.mockResolvedValueOnce({
            content: '[2026-04-01] 财报前不建仓',
        })
        const tools = createMemoryTools(deps)
        await tools.save_lesson.execute({ lesson: '不要追涨' }, toolCtx)
        const call = deps.db.memoryVersion.create.mock.calls[0][0]
        expect(call.data.content).toContain('财报前不建仓')
        expect(call.data.content).toContain('不要追涨')
    })

    it('returns error when lessons slot is full after append', async () => {
        // 990 chars existing + newline + date prefix (~13 chars) + lesson = exceeds 1000 limit
        deps.db.memoryVersion.findFirst.mockResolvedValueOnce({
            content: 'A'.repeat(990),
        })
        const tools = createMemoryTools(deps)
        const result = await tools.save_lesson.execute(
            { lesson: '新教训' },
            toolCtx,
        )
        expect(result.success).toBe(false)
    })
})

// ─── read_history ───

describe('read_history', () => {
    it('returns version history for given slot', async () => {
        const rows = [
            {
                id: 'v2',
                slot: 'market_views',
                content: '看空科技',
                author: 'agent',
                reason: null,
                createdAt: new Date('2026-04-02'),
            },
            {
                id: 'v1',
                slot: 'market_views',
                content: '看多科技',
                author: 'agent',
                reason: null,
                createdAt: new Date('2026-04-01'),
            },
        ]
        deps.db.memoryVersion.findMany.mockResolvedValueOnce(rows)
        const tool = createHistoryTool(deps)
        const result = await tool.read_history.execute(
            { slot: 'market_views', limit: 5 },
            toolCtx,
        )
        expect(result.slot).toBe('market_views')
        expect(result.versions).toHaveLength(2)
        expect(result.versions[0].id).toBe('v2')
        expect(result.versions[0].createdAt).toMatch(/2026-04-02/)
    })

    it('uses default limit of 5', async () => {
        deps.db.memoryVersion.findMany.mockResolvedValueOnce([])
        const tool = createHistoryTool(deps)
        await tool.read_history.execute({ slot: 'lessons', limit: 5 }, toolCtx)
        const call = deps.db.memoryVersion.findMany.mock.calls[0][0]
        expect(call.take).toBe(5)
    })
})
