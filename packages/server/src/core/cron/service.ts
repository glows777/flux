import { prisma } from '@/core/db'

type PrismaLike = Pick<typeof prisma, 'cronJob'>

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
