import {
  TOOL_SUMMARY_FIELDS,
  TOOL_CATEGORIES,
  type TranscriptMessage,
  type ArrayField,
} from './types'

const MAX_ARRAY_ITEMS = 3

/**
 * Extract key fields from a data tool result into a one-line summary.
 * Returns null for unknown tools or null/undefined results.
 */
export function summarizeToolResult(
  toolName: string,
  input: unknown,
  result: unknown,
): string | null {
  const fields = TOOL_SUMMARY_FIELDS[toolName]
  if (!fields) return null
  if (result == null) return null

  const inputObj = (input ?? {}) as Record<string, unknown>
  const identifier = inputObj.symbol ?? inputObj.query ?? null
  const tag = identifier ? `${toolName} ${identifier}` : toolName

  if (Array.isArray(result)) {
    const simpleFields = fields.filter((f): f is string => typeof f === 'string')
    const items = result.slice(0, MAX_ARRAY_ITEMS)
    const summaries = items.map((item: Record<string, unknown>) => {
      const vals = simpleFields
        .map((f) => item[f])
        .filter((v) => v != null)
      return vals.map((v) => `"${v}"`).join(', ')
    })
    return `> [${tag}] ${summaries.join(', ')}`
  }

  const obj = result as Record<string, unknown>
  const parts: string[] = []
  for (const spec of fields) {
    if (typeof spec === 'string') {
      if (obj[spec] != null) parts.push(`${spec}=${obj[spec]}`)
    } else {
      const arraySpec = spec as ArrayField
      const arr = obj[arraySpec.field]
      if (!Array.isArray(arr)) continue
      const items = arr.slice(0, MAX_ARRAY_ITEMS) as Record<string, unknown>[]
      const formatted = items.map((item) => {
        const vals = arraySpec.pick.map((f) => item[f]).filter((v) => v != null)
        return vals.join(': ')
      })
      parts.push(formatted.join(', '))
    }
  }
  return `> [${tag}] ${parts.join(', ')}`
}

/**
 * Extract tool name from a message part.
 * Static tools: type = "tool-{name}" → name = type.slice(5)
 * Dynamic tools: type = "dynamic-tool" → name = part.toolName
 */
function extractToolName(part: Record<string, unknown>): string | null {
  const type = part.type as string
  if (type === 'dynamic-tool') return (part.toolName as string) ?? null
  if (typeof type === 'string' && type.startsWith('tool-')) return type.slice(5)
  return null
}

/**
 * Classify a tool by its category.
 */
function classifyTool(
  name: string,
): 'data' | 'memory' | 'display' | 'trading' | 'unknown' {
  if (TOOL_CATEGORIES.DATA.has(name)) return 'data'
  if (TOOL_CATEGORIES.MEMORY.has(name)) return 'memory'
  if (TOOL_CATEGORIES.DISPLAY.has(name)) return 'display'
  if (TOOL_CATEGORIES.TRADING.has(name)) return 'trading'
  return 'unknown'
}

/** Format Date as HH:mm */
function formatTime(date: Date): string {
  const h = String(date.getUTCHours()).padStart(2, '0')
  const m = String(date.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/**
 * Clean a list of transcript messages into Markdown.
 * Groups user + assistant pairs into ## HH:mm blocks.
 */
export function cleanMessages(
  messages: TranscriptMessage[],
): string {
  const blocks: string[] = []
  let i = 0

  while (i < messages.length) {
    const msg = messages[i]
    const role = msg.message.role

    if (role === 'system') {
      i++
      continue
    }

    if (role === 'user') {
      const time = formatTime(msg.createdAt)
      const lines: string[] = [`## ${time}`, '']
      const userText = extractTextFromParts(msg.message.parts)
      if (userText) lines.push(`**User**: ${userText}`)

      // Collect following assistant messages
      let j = i + 1
      while (j < messages.length && messages[j].message.role === 'assistant') {
        const assistantLines = processAssistantParts(messages[j].message.parts)
        if (assistantLines.length > 0) {
          lines.push('')
          lines.push(...assistantLines)
        }
        j++
      }
      blocks.push(lines.join('\n'))
      i = j
      continue
    }

    if (role === 'assistant') {
      // Assistant without preceding user
      const time = formatTime(msg.createdAt)
      const lines: string[] = [`## ${time}`, '']
      const assistantLines = processAssistantParts(msg.message.parts)
      lines.push(...assistantLines)
      blocks.push(lines.join('\n'))
      i++
      continue
    }

    i++
  }

  return blocks.join('\n\n')
}

/** Extract text content from user message parts */
function extractTextFromParts(
  parts: readonly { type: string; [key: string]: unknown }[],
): string {
  return parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text as string)
    .join('\n')
}

/** Process assistant message parts into output lines */
function processAssistantParts(
  parts: readonly { type: string; [key: string]: unknown }[],
): string[] {
  const lines: string[] = []

  for (const part of parts) {
    if (part.type === 'text') {
      lines.push(part.text as string)
      continue
    }

    const toolName = extractToolName(part as Record<string, unknown>)
    if (!toolName) continue

    const category = classifyTool(toolName)
    if (category !== 'data') continue
    if (part.state !== 'output-available') continue

    const summary = summarizeToolResult(toolName, part.input, part.output)
    if (summary) lines.push(summary)
  }

  return lines
}
