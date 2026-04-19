import type { UIMessage } from 'ai'
import type { ToolContribution } from './types'

const SYSTEM_SEGMENT_OVERHEAD = 4
const MESSAGE_OVERHEAD = 6
const TOOL_OVERHEAD = 8

export function estimateTextTokens(text: string): number {
    const bytes = new TextEncoder().encode(text).length
    const chars = Array.from(text)
    const cjkChars = chars.filter((char) =>
        /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(
            char,
        ),
    ).length
    const nonCjkChars = chars.length - cjkChars

    return Math.max(
        Math.ceil(bytes / 4),
        Math.ceil(cjkChars + nonCjkChars / 4),
    )
}

export function estimateMessages(messages: UIMessage[]): number {
    return messages.reduce((total, message) => {
        const text = message.parts
            .filter(
                (part): part is Extract<
                    typeof message.parts[number],
                    { type: 'text' }
                > => part.type === 'text',
            )
            .map((part) => part.text)
            .join('\n')

        return total + estimateTextTokens(text) + MESSAGE_OVERHEAD
    }, 0)
}

export function estimateToolSpec(spec: ToolContribution['manifestSpec']): number {
    return estimateTextTokens(JSON.stringify(spec ?? {})) + TOOL_OVERHEAD
}

export function addSystemSegmentOverhead(tokens: number): number {
    return tokens + SYSTEM_SEGMENT_OVERHEAD
}
