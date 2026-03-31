import { describe, expect, test } from 'bun:test'
import { toGatewayInput } from '@/channels/discord/handlers'

function createMockMessage(overrides: Record<string, any> = {}) {
    return {
        author: { bot: false, id: 'user-1' },
        content: 'hello',
        guild: null,
        channel: { id: 'channel-1' },
        mentions: { has: () => false },
        ...overrides,
    } as any
}

describe('toGatewayInput', () => {
    test('returns null for bot messages', () => {
        const msg = createMockMessage({ author: { bot: true, id: 'bot-1' } })
        expect(toGatewayInput(msg, 'bot-1')).toBeNull()
    })

    test('returns null for guild messages without mention', () => {
        const msg = createMockMessage({
            guild: { id: 'guild-1' },
            mentions: { has: () => false },
        })
        expect(toGatewayInput(msg, 'bot-1')).toBeNull()
    })

    test('converts DM to gateway input', () => {
        const msg = createMockMessage({ content: 'hello bot' })
        const result = toGatewayInput(msg, 'bot-1')
        expect(result).toEqual({
            channel: 'discord',
            content: 'hello bot',
            channelId: 'user-1',
            userId: 'user-1',
        })
    })

    test('converts guild mention to gateway input with stripped mention', () => {
        const msg = createMockMessage({
            content: '<@bot-1> what is NVDA?',
            guild: { id: 'guild-1' },
            channel: { id: 'channel-1' },
            mentions: { has: () => true },
        })
        const result = toGatewayInput(msg, 'bot-1')
        expect(result).toEqual({
            channel: 'discord',
            content: 'what is NVDA?',
            channelId: 'guild-1:channel-1',
            userId: 'user-1',
        })
    })

    test('returns null for mention-only message (empty after strip)', () => {
        const msg = createMockMessage({
            content: '<@bot-1>',
            guild: { id: 'guild-1' },
            mentions: { has: () => true },
        })
        expect(toGatewayInput(msg, 'bot-1')).toBeNull()
    })
})
