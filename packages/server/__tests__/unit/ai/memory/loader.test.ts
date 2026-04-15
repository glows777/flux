import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { type LoaderDeps, loadMemoryContext } from '@/core/ai/memory/loader'

// ─── Mock DB ───

function createMockDb() {
    return {
        memoryVersion: {
            findFirst: mock(() => Promise.resolve(null)),
            findMany: mock(() => Promise.resolve([])),
            create: mock(() => Promise.resolve({ id: 'v1' })),
        },
    } as unknown as LoaderDeps['db']
}

let mockDb: ReturnType<typeof createMockDb>
type FindFirstArgs = { where: { slot: string } }

beforeEach(() => {
    mockDb = createMockDb()
})

describe('loadMemoryContext', () => {
    it('returns empty string when all slots are empty', async () => {
        const result = await loadMemoryContext({ db: mockDb })
        expect(result).toBe('')
    })

    it('returns section for user_profile when it has content', async () => {
        mockDb.memoryVersion.findFirst.mockImplementation(
            ({ where }: FindFirstArgs) => {
                if (where.slot === 'user_profile')
                    return Promise.resolve({ content: '偏好成长股' })
                return Promise.resolve(null)
            },
        )
        const result = await loadMemoryContext({ db: mockDb })
        expect(result).toContain('## 用户档案')
        expect(result).toContain('偏好成长股')
    })

    it('includes all 5 trading-agent slots when all have content', async () => {
        const slotContents: Record<string, string> = {
            user_profile: '成长股偏好',
            portfolio_thesis: '持有 AAPL 因为服务增长',
            market_views: '科技板块看多',
            active_focus: '关注 NVDA AI 算力',
            lessons: '不要追涨',
        }
        mockDb.memoryVersion.findFirst.mockImplementation(
            ({ where }: FindFirstArgs) => {
                const content = slotContents[where.slot]
                return Promise.resolve(content ? { content } : null)
            },
        )
        const result = await loadMemoryContext({ db: mockDb })
        expect(result).toContain('## 用户档案')
        expect(result).toContain('## 持仓论点')
        expect(result).toContain('## 市场观点')
        expect(result).toContain('## 当前关注')
        expect(result).toContain('## 交易教训')
    })

    it('does NOT include agent_strategy even if it has content', async () => {
        mockDb.memoryVersion.findFirst.mockImplementation(
            ({ where }: FindFirstArgs) => {
                if (where.slot === 'agent_strategy')
                    return Promise.resolve({ content: '策略内容' })
                return Promise.resolve(null)
            },
        )
        const result = await loadMemoryContext({ db: mockDb })
        expect(result).not.toContain('策略内容')
        expect(result).not.toContain('## 自主策略')
    })

    it('skips empty slots without placeholder', async () => {
        mockDb.memoryVersion.findFirst.mockImplementation(
            ({ where }: FindFirstArgs) => {
                if (where.slot === 'user_profile')
                    return Promise.resolve({ content: '档案' })
                return Promise.resolve(null)
            },
        )
        const result = await loadMemoryContext({ db: mockDb })
        expect(result).not.toContain('portfolio_thesis')
        expect(result).not.toContain('market_views')
        expect(result).not.toContain('null')
        expect(result).not.toContain('undefined')
    })

    it('sections are separated by double newline', async () => {
        mockDb.memoryVersion.findFirst.mockImplementation(
            ({ where }: FindFirstArgs) => {
                if (where.slot === 'user_profile')
                    return Promise.resolve({ content: '档案' })
                if (where.slot === 'lessons')
                    return Promise.resolve({ content: '不要追涨' })
                return Promise.resolve(null)
            },
        )
        const result = await loadMemoryContext({ db: mockDb })
        const sections = result.split('\n\n')
        expect(sections.length).toBe(2)
    })
})
