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

function isContextManifestShape(value: unknown): value is ContextManifest {
    if (!isPlainObject(value)) return false

    return (
        typeof value.runId === 'string' &&
        typeof value.createdAt === 'string' &&
        isManifestInputShape(value.input) &&
        Array.isArray(value.pluginOutputs) &&
        isAssembledContextShape(value.assembledContext) &&
        isModelRequestShape(value.modelRequest)
    )
}

export async function saveMessageManifest(
    sessionId: string,
    messageId: string,
    manifest: ContextManifest,
    deps: SessionManifestDeps,
): Promise<void> {
    const serializedManifest = JSON.stringify(manifest)

    await deps.db.chatMessageManifest.upsert({
        where: {
            sessionId_messageId: { sessionId, messageId },
        },
        create: {
            sessionId,
            messageId,
            runId: manifest.runId,
            manifest: serializedManifest,
            version: MESSAGE_MANIFEST_VERSION,
        },
        update: {
            runId: manifest.runId,
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
    const row = await deps.db.chatMessageManifest.findUnique({
        where: {
            sessionId_messageId: { sessionId, messageId },
        },
        select: {
            version: true,
            runId: true,
            manifest: true,
        },
    })

    if (!row) {
        const sessionStore = deps.db.chatSession as
            | {
                  findUnique?: (args: {
                      where: { id: string }
                      select?: { id: boolean }
                  }) => Promise<{ id: string } | null>
              }
            | undefined
        const messageStore = deps.db.chatMessage as
            | {
                  findUnique?: (args: {
                      where: {
                          sessionId_messageId: {
                              sessionId: string
                              messageId: string
                          }
                      }
                      select?: { id: boolean }
                  }) => Promise<{ id: string } | null>
              }
            | undefined

        if (sessionStore?.findUnique && messageStore?.findUnique) {
            const session = await sessionStore.findUnique({
                where: { id: sessionId },
                select: { id: true },
            })
            if (!session) {
                throw new SessionError('Session not found', 'NOT_FOUND')
            }

            const message = await messageStore.findUnique({
                where: {
                    sessionId_messageId: { sessionId, messageId },
                },
                select: { id: true },
            })
            if (!message) {
                throw new SessionError('Message not found', 'NOT_FOUND')
            }
        }

        return null
    }

    const invalidManifestError = () =>
        new SessionError(
            `Failed to parse manifest content for message ${messageId}`,
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
