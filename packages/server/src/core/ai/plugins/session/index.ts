import type { AIPlugin, HookContext, AfterChatContext } from '../../runtime/types'
import type { UIMessage } from 'ai'
import {
  createSession as defaultCreateSession,
  loadMessages as defaultLoadMessages,
  appendMessage as defaultAppendMessage,
  touchSession as defaultTouchSession,
} from '../../session'
import { prisma as defaultPrisma } from '@/core/db'

const DEFAULT_TRUNCATE_LIMIT = 20

interface SessionPluginDeps {
  createSession: (symbol: string | undefined, firstMessage: string) => Promise<string>
  loadMessages: (sessionId: string) => Promise<UIMessage[]>
  appendMessage: (sessionId: string, message: UIMessage) => Promise<void>
  touchSession: (sessionId: string) => Promise<void>
  resolveSession: (params: {
    channel: string
    channelId: string
    userId: string
    symbol?: string
    title?: string
  }) => Promise<string>
}

interface SessionPluginOptions {
  truncateLimit?: number
  deps?: Partial<SessionPluginDeps>
}

function getLastUserMessage(messages: UIMessage[]): UIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i]
  }
  return undefined
}

function extractFirstMessageText(messages: UIMessage[]): string {
  const first = messages.find(m => m.role === 'user')
  if (!first) return 'New chat'
  const textPart = first.parts?.find((p: any) => p.type === 'text') as { text: string } | undefined
  return textPart?.text?.slice(0, 100) ?? 'New chat'
}

async function defaultResolveSession(params: {
  channel: string
  channelId: string
  userId: string
  symbol?: string
  title?: string
}): Promise<string> {
  const db = defaultPrisma

  const existing = await db.chatSession.findFirst({
    where: {
      channel: params.channel,
      channelSessionId: params.channelId,
    },
    orderBy: { createdAt: 'desc' },
  })

  if (existing) return existing.id

  const session = await db.chatSession.create({
    data: {
      channel: params.channel,
      channelSessionId: params.channelId,
      channelUserId: params.userId,
      symbol: params.symbol ?? null,
      title: params.title ?? 'New session',
    },
  })
  return session.id
}

export function sessionPlugin(options?: SessionPluginOptions): AIPlugin {
  const limit = options?.truncateLimit ?? DEFAULT_TRUNCATE_LIMIT
  const deps: SessionPluginDeps = {
    createSession: async (symbol, firstMessage) => {
      const session = await defaultCreateSession(symbol ?? null, firstMessage)
      return session.id
    },
    loadMessages: defaultLoadMessages,
    appendMessage: defaultAppendMessage,
    touchSession: defaultTouchSession,
    resolveSession: defaultResolveSession,
    ...options?.deps,
  }

  return {
    name: 'session',

    async beforeChat(ctx: HookContext): Promise<void> {
      let sessionId = ctx.sessionId

      if (!sessionId && ctx.meta.has('channelId')) {
        // Discord/Cron path: resolve by channelId
        sessionId = await deps.resolveSession({
          channel: ctx.channel,
          channelId: ctx.meta.get('channelId') as string,
          userId: ctx.meta.get('userId') as string ?? 'system',
          symbol: ctx.symbol,
          title: extractFirstMessageText(ctx.rawMessages),
        })
      } else if (!sessionId) {
        // Web path: create new session
        sessionId = await deps.createSession(
          ctx.symbol,
          extractFirstMessageText(ctx.rawMessages),
        )
      }

      ctx.meta.set('sessionId', sessionId)

      // Persist last user message
      const lastUserMsg = getLastUserMessage(ctx.rawMessages)
      if (lastUserMsg) {
        await deps.appendMessage(sessionId, lastUserMsg)
      }
    },

    async transformMessages(ctx: HookContext, messages: UIMessage[]): Promise<UIMessage[]> {
      // For discord/cron: load history from DB (already includes the just-appended user message)
      const channelId = ctx.meta.get('channelId') as string | undefined
      if (channelId) {
        const sessionId = ctx.meta.get('sessionId') as string
        if (sessionId) {
          const history = await deps.loadMessages(sessionId)
          if (history.length > limit) return history.slice(-limit)
          return history
        }
      }

      // Web path: messages come from frontend (already include history)
      if (messages.length <= limit) return messages
      return messages.slice(-limit)
    },

    async afterChat(ctx: AfterChatContext): Promise<void> {
      await deps.appendMessage(ctx.sessionId, ctx.responseMessage)
      await deps.touchSession(ctx.sessionId)
    },
  }
}
