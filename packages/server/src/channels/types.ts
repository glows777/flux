export type ChannelType = 'web' | 'discord' | 'cron'

export interface ChannelTarget {
    readonly channelId: string
    readonly userId?: string
}

export interface ChannelMessage {
    readonly content: string
    readonly attachments?: readonly Attachment[]
}

export interface Attachment {
    readonly url: string
    readonly name: string
    readonly contentType?: string
}

export interface ChannelAdapter {
    readonly type: ChannelType
    start(): Promise<void>
    stop(): Promise<void>
    send(target: ChannelTarget, message: ChannelMessage): Promise<void>
}
