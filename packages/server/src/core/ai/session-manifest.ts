import type { PrismaClient } from '@prisma/client'
import type { ContextManifest } from './runtime'
import { SessionError } from './session-errors'

const MESSAGE_MANIFEST_VERSION = 1

export interface SessionManifestDeps {
    readonly db: PrismaClient
}

export interface MessageManifestRecord {
    readonly version: number
    readonly runId: string
    readonly manifest: ContextManifest
}

interface MessageManifestRow {
    readonly version: number
    readonly runId: string
    readonly manifest: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasStringKey(value: Record<string, unknown>, key: string): boolean {
    return typeof value[key] === 'string'
}

function hasArrayKey(value: Record<string, unknown>, key: string): boolean {
    return Array.isArray(value[key])
}

function hasObjectKey(value: Record<string, unknown>, key: string): boolean {
    return isPlainObject(value[key])
}

function hasOptionalStringKey(
    value: Record<string, unknown>,
    key: string,
): boolean {
    return !(key in value) || typeof value[key] === 'string'
}

function hasOptionalNumberKey(
    value: Record<string, unknown>,
    key: string,
): boolean {
    return !(key in value) || typeof value[key] === 'number'
}

function hasOptionalBooleanKey(
    value: Record<string, unknown>,
    key: string,
): boolean {
    return !(key in value) || typeof value[key] === 'boolean'
}

function isCacheEvidenceSource(value: unknown): boolean {
    return (
        value === 'totalUsage' ||
        value === 'providerMetadata' ||
        value === 'both' ||
        value === 'none'
    )
}

function hasOptionalCacheEvidenceSourceKey(
    value: Record<string, unknown>,
    key: string,
): boolean {
    return !(key in value) || isCacheEvidenceSource(value[key])
}

function isManifestInputShape(
    value: unknown,
): value is Record<string, unknown> {
    if (!isPlainObject(value)) return false

    return (
        hasStringKey(value, 'channel') &&
        hasStringKey(value, 'mode') &&
        hasStringKey(value, 'agentType') &&
        hasArrayKey(value, 'rawMessages') &&
        hasObjectKey(value, 'defaults')
    )
}

function isAssembledContextShape(
    value: unknown,
): value is Record<string, unknown> {
    if (!isPlainObject(value)) return false

    return (
        hasArrayKey(value, 'segments') &&
        hasArrayKey(value, 'systemSegments') &&
        hasArrayKey(value, 'tools') &&
        hasObjectKey(value, 'params') &&
        typeof value.totalEstimatedInputTokens === 'number'
    )
}

function isModelRequestShape(value: unknown): value is Record<string, unknown> {
    if (!isPlainObject(value)) return false

    return (
        hasStringKey(value, 'systemText') &&
        hasArrayKey(value, 'modelMessages') &&
        hasArrayKey(value, 'toolNames') &&
        hasObjectKey(value, 'resolvedParams') &&
        hasObjectKey(value, 'providerOptions')
    )
}

function isCachePlanShape(value: unknown): value is Record<string, unknown> {
    if (!isPlainObject(value)) return false
    if (!hasOptionalStringKey(value, 'modelId')) return false
    if (!hasOptionalNumberKey(value, 'minCacheablePrefixTokens')) return false
    if (!isPlainObject(value.eligibility)) return false
    if (!hasOptionalNumberKey(value.eligibility, 'minCacheablePrefixTokens')) {
        return false
    }

    return (
        hasStringKey(value, 'provider') &&
        hasArrayKey(value, 'stableCoreSegmentIds') &&
        hasArrayKey(value, 'cacheableSessionSegmentIds') &&
        hasArrayKey(value, 'dynamicTailSegmentIds') &&
        hasArrayKey(value, 'effectivePrefixSegmentIds') &&
        typeof value.effectivePrefixEstimatedTokens === 'number' &&
        hasArrayKey(value, 'breakpoints') &&
        hasObjectKey(value, 'hashes')
    )
}

function isCacheResultShape(value: unknown): value is Record<string, unknown> {
    if (!isPlainObject(value)) return false

    if (
        !(
            typeof value.cacheObserved === 'boolean' &&
            hasStringKey(value, 'rolloutGateStatus') &&
            hasStringKey(value, 'circuitBreakerState')
        )
    ) {
        return false
    }

    if (
        'evidenceSource' in value &&
        !isCacheEvidenceSource(value.evidenceSource)
    ) {
        return false
    }

    const hasDirectionalEvidence =
        'cacheReadObserved' in value ||
        'cacheWriteObserved' in value ||
        'cacheReadEvidenceSource' in value ||
        'cacheWriteEvidenceSource' in value

    if (hasDirectionalEvidence) {
        return (
            hasOptionalBooleanKey(value, 'cacheReadObserved') &&
            hasOptionalBooleanKey(value, 'cacheWriteObserved') &&
            hasOptionalCacheEvidenceSourceKey(
                value,
                'cacheReadEvidenceSource',
            ) &&
            hasOptionalCacheEvidenceSourceKey(
                value,
                'cacheWriteEvidenceSource',
            ) &&
            'cacheReadObserved' in value &&
            'cacheWriteObserved' in value &&
            'cacheReadEvidenceSource' in value &&
            'cacheWriteEvidenceSource' in value
        )
    }

    return true
}

function isResultShape(value: unknown): value is Record<string, unknown> {
    if (!isPlainObject(value)) return false

    if (
        !('text' in value) ||
        !('responseMessage' in value) ||
        !('toolCalls' in value) ||
        !('usage' in value)
    ) {
        return false
    }

    if (typeof value.text !== 'string') return false
    if (!isPlainObject(value.responseMessage)) return false
    if (!Array.isArray(value.toolCalls)) return false
    if (!isPlainObject(value.usage)) return false

    if ('cacheResult' in value && !isCacheResultShape(value.cacheResult)) {
        return false
    }

    return true
}

function isContextManifestShape(value: unknown): value is ContextManifest {
    if (!isPlainObject(value)) return false

    if ('cachePlan' in value && !isCachePlanShape(value.cachePlan)) {
        return false
    }

    if ('result' in value && !isResultShape(value.result)) {
        return false
    }

    return (
        typeof value.runId === 'string' &&
        typeof value.createdAt === 'string' &&
        isManifestInputShape(value.input) &&
        Array.isArray(value.pluginOutputs) &&
        isAssembledContextShape(value.assembledContext) &&
        isModelRequestShape(value.modelRequest)
    )
}

function parseMessageManifestRow(
    row: MessageManifestRow,
    sourceLabel: string,
): MessageManifestRecord {
    const invalidManifestError = () =>
        new SessionError(
            `Failed to parse manifest content for ${sourceLabel}`,
            'INVALID_INPUT',
        )

    let parsedManifest: unknown
    try {
        parsedManifest = JSON.parse(row.manifest)
    } catch {
        throw invalidManifestError()
    }

    if (!isContextManifestShape(parsedManifest)) {
        throw invalidManifestError()
    }

    return {
        version: row.version,
        runId: row.runId,
        manifest: parsedManifest,
    }
}

export async function saveMessageManifest(
    sessionId: string,
    messageId: string,
    manifest: ContextManifest,
    deps: SessionManifestDeps,
): Promise<void> {
    const serializedManifest = JSON.stringify(manifest)

    await deps.db.chatMessageManifest.upsert({
        where: { runId: manifest.runId },
        create: {
            sessionId,
            messageId,
            runId: manifest.runId,
            manifest: serializedManifest,
            version: MESSAGE_MANIFEST_VERSION,
        },
        update: {
            sessionId,
            messageId,
            manifest: serializedManifest,
            version: MESSAGE_MANIFEST_VERSION,
        },
    })
}

export async function loadMessageManifest(
    sessionId: string,
    messageId: string,
    deps: SessionManifestDeps,
): Promise<MessageManifestRecord | null> {
    const row = await deps.db.chatMessageManifest.findFirst({
        where: { sessionId, messageId },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
            version: true,
            runId: true,
            manifest: true,
        },
    })

    if (!row) {
        const sessionStore = deps.db.chatSession as unknown as
            | {
                  findUnique?: (args: {
                      where: { id: string }
                      select?: { id: boolean }
                  }) => Promise<{ id: string } | null>
              }
            | undefined
        const messageStore = deps.db.chatMessage as unknown as
            | {
                  findFirst?: (args: {
                      where: { sessionId: string; messageId: string }
                      select?: { id: boolean }
                  }) => Promise<{ id: string } | null>
              }
            | undefined

        if (sessionStore?.findUnique && messageStore?.findFirst) {
            const session = await sessionStore.findUnique({
                where: { id: sessionId },
                select: { id: true },
            })
            if (!session) {
                throw new SessionError('Session not found', 'NOT_FOUND')
            }

            const message = await messageStore.findFirst({
                where: { sessionId, messageId },
                select: { id: true },
            })
            if (!message) {
                throw new SessionError('Message not found', 'NOT_FOUND')
            }
        }

        return null
    }

    return parseMessageManifestRow(row, `message ${messageId}`)
}

export async function loadMessageManifestByRunId(
    runId: string,
    deps: SessionManifestDeps,
): Promise<MessageManifestRecord | null> {
    const row = await deps.db.chatMessageManifest.findUnique({
        where: { runId },
        select: {
            version: true,
            runId: true,
            manifest: true,
        },
    })

    if (!row) {
        return null
    }

    return parseMessageManifestRow(row, `run ${runId}`)
}
