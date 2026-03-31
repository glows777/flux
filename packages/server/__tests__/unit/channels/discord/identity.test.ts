import { describe, expect, test } from 'bun:test'
import { buildChannelSessionId } from '@/channels/discord/identity'

describe('buildChannelSessionId', () => {
    test('returns guildId:channelId for guild context', () => {
        expect(buildChannelSessionId({
            guildId: 'guild-1',
            channelId: 'channel-1',
            userId: 'user-1',
        })).toBe('guild-1:channel-1')
    })

    test('returns userId for DM context (guildId is null)', () => {
        expect(buildChannelSessionId({
            guildId: null,
            channelId: 'dm-channel-1',
            userId: 'user-1',
        })).toBe('user-1')
    })
})
