import { sValidator } from '@hono/standard-validator'
import type { UIMessage } from 'ai'
import { generateId } from 'ai'
import { Hono } from 'hono'
import { z } from 'zod'
import { SessionError } from '@/core/ai/session'
import type { Gateway } from '@/gateway/gateway'

const SESSION_ERROR_CODE_TO_STATUS = {
    NOT_FOUND: 404,
    INVALID_INPUT: 400,
} as const

const globalChatSchema = z.object({
    messages: z.array(z.any()),
    sessionId: z.string().nullable().optional(),
    symbol: z.string().nullable().optional(),
})

const onValidationError = (
    result: { success: boolean; error?: readonly { message: string }[] },
    c: { json: (data: unknown, status: number) => Response },
) => {
    if (!result.success) {
        const message = result.error?.[0]?.message ?? 'Validation failed'
        return c.json({ success: false, error: message }, 400)
    }
}

export function createChatRoutes(gateway: Gateway) {
    return new Hono().post(
        '/',
        sValidator('json', globalChatSchema, onValidationError),
        async (c) => {
            const { messages, sessionId, symbol } = c.req.valid('json')
            const upperSymbol = symbol?.toUpperCase() ?? undefined

            try {
                const output = await gateway.chat({
                    channel: 'web',
                    mode: 'conversation',
                    messages: messages as UIMessage[],
                    sessionId: sessionId ?? undefined,
                    symbol: upperSymbol,
                })

                return output.streamResult.toUIMessageStreamResponse({
                    originalMessages: messages as UIMessage[],
                    generateMessageId: generateId,
                    sendReasoning: true,
                    sendSources: false,
                    messageMetadata: () => ({
                        sessionId: output.sessionId,
                    }),
                    onFinish: async ({
                        responseMessage,
                    }: {
                        responseMessage: UIMessage
                    }) => {
                        await output.finalize(responseMessage)
                    },
                })
            } catch (error) {
                if (error instanceof SessionError) {
                    const status =
                        SESSION_ERROR_CODE_TO_STATUS[error.code] ?? 500
                    return c.json(
                        { success: false, error: error.message },
                        status as 400 | 404 | 409 | 500,
                    )
                }
                return c.json(
                    {
                        success: false,
                        error: 'Failed to generate chat response',
                    },
                    500,
                )
            }
        },
    )
}
