export function buildChannelSessionId(source: {
    readonly guildId: string | null
    readonly channelId: string
    readonly userId: string
}): string {
    return source.guildId
        ? `${source.guildId}:${source.channelId}`
        : source.userId
}
