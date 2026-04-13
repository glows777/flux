import { describe, expect, it, mock, spyOn } from 'bun:test'

mock.module('discord.js', () => {
  class SlashCommandBuilder {
    name?: string
    description?: string

    setName(name: string): SlashCommandBuilder {
      this.name = name
      return this
    }

    setDescription(description: string): SlashCommandBuilder {
      this.description = description
      return this
    }

    toJSON() {
      return {
        name: this.name,
        description: this.description,
        options: [],
      }
    }
  }

  return {
    Client: class {},
    Partials: { Channel: 'Channel' },
    MessageFlags: { Ephemeral: 1 },
    SlashCommandBuilder,
  }
})

mock.module('@discordjs/ws', () => ({
  WebSocketShardEvents: {
    HeartbeatComplete: 'heartbeatComplete',
  },
}))

const { DiscordAdapter } = await import('../../../../src/channels/discord/bot')

const makeAdapter = () =>
  new DiscordAdapter(
    { token: 'discord-token', intents: [] as any },
    {} as any,
  )

const makeClient = (overrides: Record<string, unknown> = {}) => ({
  isReady: () => true,
  ws: { ping: 42 },
  ...overrides,
})

describe('DiscordAdapter health hooks', () => {
  it('reports healthy when the client is ready and gateway activity is recent', async () => {
    const adapter = makeAdapter()
    const client = makeClient()
    ;(adapter as any).client = client
    ;(adapter as any).lastGatewayActivityAtMs = Date.now() - 30_000

    const health = await adapter.checkHealth()

    expect(health.status).toBe('healthy')
    expect(health.reason).toBeUndefined()
    expect(health.details).toContain('client.ws.ping=42ms')
    expect(typeof health.checkedAt).toBe('string')
  })

  it('reports unhealthy when gateway activity is stale', async () => {
    const adapter = makeAdapter()
    const client = makeClient()
    ;(adapter as any).client = client
    ;(adapter as any).lastGatewayActivityAtMs = Date.now() - 130_000

    const health = await adapter.checkHealth()

    expect(health.status).toBe('unhealthy')
    expect(health.reason).toBe('no_recent_gateway_event')
    expect(health.details).toContain('client.ws.ping=42ms')
    expect(typeof health.checkedAt).toBe('string')
  })

  it('reports unhealthy when the Discord client is not ready', async () => {
    const adapter = makeAdapter()
    ;(adapter as any).client = {
      isReady: () => false,
      ws: { ping: 42 },
    }

    const health = await adapter.checkHealth()

    expect(health.status).toBe('unhealthy')
    expect(health.reason).toBe('client_not_ready')
  })

  it('restarts the client during recovery even if stop fails', async () => {
    const consoleSpy = spyOn(console, 'error').mockImplementation(() => {})
    const adapter = makeAdapter()
    const stop = mock(async () => {
      throw new Error('stop failed')
    })
    const start = mock(async () => {})

    ;(adapter as any).stop = stop
    ;(adapter as any).start = start

    await adapter.recoverHealth()

    expect(stop).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)
    consoleSpy.mockRestore()
  })
})
