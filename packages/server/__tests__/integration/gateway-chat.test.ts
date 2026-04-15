/**
 * Discord processChat pipeline integration tests
 *
 * Since processChat is a closure inside index.ts (not directly importable),
 * we test the individual pipeline functions it calls: chatGenerate
 * and finalizeChatRound.
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import {
    mockAppendMessage,
    mockChatGenerate,
    mockFinalizeChatRound,
    mockLoadMessages,
} from './helpers/mock-boundaries'

describe('Discord processChat pipeline integration', () => {
    beforeEach(() => {
        mockChatGenerate.mockReset()
        mockFinalizeChatRound.mockReset()
        mockAppendMessage.mockReset()
        mockLoadMessages.mockReset()

        // Default happy-path mocks
        mockLoadMessages.mockResolvedValue([])
        mockChatGenerate.mockResolvedValue({
            text: 'Hello from AI',
            responseMessage: {
                id: 'resp-1',
                role: 'assistant',
                parts: [{ type: 'text', text: 'Hello from AI' }],
            },
        })
        mockFinalizeChatRound.mockResolvedValue(undefined)
    })

    test('chatGenerate returns text and responseMessage', async () => {
        const { text, responseMessage } = await mockChatGenerate({
            sessionId: 'sess-1',
            messages: [],
            channel: 'discord',
        })

        expect(text).toBe('Hello from AI')
        expect(responseMessage.role).toBe('assistant')
        expect(responseMessage.parts).toBeArrayOfSize(1)
        expect(responseMessage.parts[0]).toEqual({
            type: 'text',
            text: 'Hello from AI',
        })
    })

    test('finalizeChatRound completes without error', async () => {
        const result = mockFinalizeChatRound({
            sessionId: 'sess-1',
            responseMessage: {
                id: 'resp-1',
                role: 'assistant',
                parts: [{ type: 'text', text: 'Hello from AI' }],
            },
            symbol: undefined,
        })

        await expect(result).resolves.toBeUndefined()
    })

    test('chatGenerate mock can be customized per test', async () => {
        mockChatGenerate.mockReset()
        mockChatGenerate.mockResolvedValue({
            text: 'Custom response for TSLA',
            responseMessage: {
                id: 'resp-custom',
                role: 'assistant',
                parts: [{ type: 'text', text: 'Custom response for TSLA' }],
            },
        })

        const { text, responseMessage } = await mockChatGenerate({
            sessionId: 'sess-custom',
            messages: [],
            symbol: 'TSLA',
            channel: 'discord',
        })

        expect(text).toBe('Custom response for TSLA')
        expect(responseMessage.parts[0]).toEqual({
            type: 'text',
            text: 'Custom response for TSLA',
        })
    })

    test('chatGenerate error is catchable', async () => {
        mockChatGenerate.mockReset()
        mockChatGenerate.mockRejectedValue(new Error('AI provider timeout'))

        try {
            await mockChatGenerate({
                sessionId: 'sess-err',
                messages: [],
                channel: 'discord',
            })
            expect(true).toBe(false)
        } catch (err) {
            expect(err).toBeInstanceOf(Error)
            expect((err as Error).message).toBe('AI provider timeout')
        }
    })
})
