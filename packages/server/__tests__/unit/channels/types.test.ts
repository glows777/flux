import { describe, expect, test } from 'bun:test'
import type { ChannelAdapter, ChannelTarget, ChannelMessage, ChannelType } from '@/channels/types'

describe('Channel types', () => {
    test('ChannelType includes expected values', () => {
        const types: ChannelType[] = ['web', 'discord', 'cron']
        expect(types).toContain('discord')
        expect(types).toContain('web')
        expect(types).toContain('cron')
    })

    test('ChannelTarget shape is valid', () => {
        const target: ChannelTarget = { channelId: 'test-channel' }
        expect(target.channelId).toBe('test-channel')
        expect(target.userId).toBeUndefined()
    })

    test('ChannelMessage shape is valid', () => {
        const msg: ChannelMessage = { content: 'hello' }
        expect(msg.content).toBe('hello')
        expect(msg.attachments).toBeUndefined()
    })
})
