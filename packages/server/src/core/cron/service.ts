import { prisma } from '@/core/db'

type PrismaLike = Pick<typeof prisma, 'cronJob' | 'cronJobRun'>

export async function createCronJob(
    data: {
        name: string
        schedule: string
        taskType: string
        taskPayload: unknown
        channel: string
        channelTarget?: unknown
        userId: string
    },
    deps: PrismaLike = prisma,
) {
    return deps.cronJob.create({
        data: {
            ...data,
            taskPayload: data.taskPayload as any,
            channelTarget: data.channelTarget as any,
        },
    })
}

export async function listCronJobs(
    scope?: { channel?: string; userId?: string },
    deps: PrismaLike = prisma,
) {
    return deps.cronJob.findMany({
        where: scope ? { channel: scope.channel, userId: scope.userId } : undefined,
        orderBy: { createdAt: 'desc' },
    })
}

export async function updateCronJob(
    id: string,
    data: Partial<{ name: string; schedule: string; enabled: boolean; taskPayload: unknown; channelTarget: unknown }>,
    deps: PrismaLike = prisma,
) {
    return deps.cronJob.update({ where: { id }, data: data as any })
}

export async function deleteCronJob(id: string, deps: PrismaLike = prisma) {
    return deps.cronJob.delete({ where: { id } })
}

export async function getCronJob(id: string, deps: PrismaLike = prisma) {
    return deps.cronJob.findUnique({ where: { id } })
}

export async function createCronJobRun(
    data: {
        jobId: string
        status: string
        output?: string | null
        error?: string | null
        durationMs?: number | null
        triggeredBy?: string
    },
    deps: PrismaLike = prisma,
) {
    return deps.cronJobRun.create({ data })
}

export async function listCronJobRuns(
    jobId: string,
    pagination: { page?: number; limit?: number } = {},
    deps: PrismaLike = prisma,
) {
    const page = pagination.page ?? 1
    const limit = pagination.limit ?? 20
    const skip = (page - 1) * limit

    const [runs, total] = await Promise.all([
        deps.cronJobRun.findMany({
            where: { jobId },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        }),
        deps.cronJobRun.count({ where: { jobId } }),
    ])
    return { runs, total }
}

export async function listAllRuns(
    filters: { jobId?: string; status?: string } = {},
    pagination: { page?: number; limit?: number } = {},
    deps: PrismaLike = prisma,
) {
    const page = pagination.page ?? 1
    const limit = pagination.limit ?? 50
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (filters.jobId) where.jobId = filters.jobId
    if (filters.status) where.status = filters.status

    const [runs, total] = await Promise.all([
        deps.cronJobRun.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            include: { job: { select: { name: true } } },
        }),
        deps.cronJobRun.count({ where }),
    ])

    const data = runs.map((r: any) => ({ ...r, jobName: r.job?.name ?? '' }))
    return { runs: data, total }
}

export async function seedTradingHeartbeat(deps?: { db?: typeof prisma }): Promise<void> {
    const db = deps?.db ?? prisma

    const existing = await db.cronJob.findFirst({
        where: { name: 'trading-heartbeat' },
    })

    if (!existing) {
        await db.cronJob.create({
            data: {
                name: 'trading-heartbeat',
                schedule: '0 */30 21-23,0-4 * * 1-6',
                taskType: 'auto-trading-agent',
                taskPayload: { prompt: '执行交易检查循环。' },
                channel: 'web',
                userId: 'system',
            },
        })
    }
}
