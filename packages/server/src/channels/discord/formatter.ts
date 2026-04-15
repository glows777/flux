const DISCORD_MAX_LENGTH = 2000

export function splitMessage(
    content: string,
    maxLength = DISCORD_MAX_LENGTH,
): readonly string[] {
    if (content.length <= maxLength) return [content]

    const chunks: string[] = []
    let remaining = content

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining)
            break
        }

        let splitIndex = remaining.lastIndexOf('\n', maxLength)
        if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
            splitIndex = remaining.lastIndexOf(' ', maxLength)
        }
        if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
            splitIndex = maxLength
        }

        chunks.push(remaining.slice(0, splitIndex))
        remaining = remaining.slice(splitIndex).trimStart()
    }

    return chunks
}
