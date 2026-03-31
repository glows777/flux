import { describe, expect, it, mock } from 'bun:test'
import { seedTradingHeartbeat } from '@/core/cron/service'

describe('seedTradingHeartbeat', () => {
  it('creates cron job when none exists', async () => {
    const mockCreate = mock(() => Promise.resolve({ id: 'test-id' }))
    const db = {
      cronJob: {
        findFirst: mock(() => Promise.resolve(null)),
        create: mockCreate,
      },
    } as any

    await seedTradingHeartbeat({ db })

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const data = mockCreate.mock.calls[0][0].data
    expect(data.name).toBe('trading-heartbeat')
    expect(data.taskType).toBe('auto-trading-agent')
    expect(data.channel).toBe('web')
  })

  it('skips creation when job already exists', async () => {
    const mockCreate = mock(() => Promise.resolve({ id: 'test-id' }))
    const db = {
      cronJob: {
        findFirst: mock(() => Promise.resolve({ id: 'existing' })),
        create: mockCreate,
      },
    } as any

    await seedTradingHeartbeat({ db })

    expect(mockCreate).not.toHaveBeenCalled()
  })
})
