type JsonRecord = Record<string, unknown>

interface UIMessageLike {
    id: string
    role: string
    parts?: Array<{ type: string; text?: string }>
    content?: string
    metadata?: JsonRecord
}

interface StreamRun {
    label: 'run1' | 'run2'
    responseStatus: number
    streamed: boolean
    bytes: number
    sessionId?: string
    parsedEvents: number
}

interface RunTraceResponse {
    success: boolean
    data?: {
        trace?: JsonRecord
    }
    error?: string
}

interface ReportLine {
    status: 'PASS' | 'FAIL' | 'INCONCLUSIVE'
    message: string
}

const DEFAULT_SERVER_URL = 'http://localhost:3001'
const STREAM_TIMEOUT_MS = Number(process.env.VERIFY_TIMEOUT_MS) || 180_000
const POLL_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 750

function usage(): string {
    return [
        'Usage: bun run verify:prompt-cache-chat-flow',
        '',
        'Environment:',
        `  SERVER_URL or FLUX_SERVER_URL  Server base URL. Default: ${DEFAULT_SERVER_URL}`,
        `  VERIFY_TIMEOUT_MS             Per-chat stream timeout. Default: ${STREAM_TIMEOUT_MS}`,
        '',
        'The script assumes the Flux server is already running.',
    ].join('\n')
}

function serverUrl(): string {
    const raw =
        process.env.SERVER_URL?.trim() ||
        process.env.FLUX_SERVER_URL?.trim() ||
        DEFAULT_SERVER_URL

    return raw.replace(/\/+$/, '')
}

function createUserMessage(id: string, text: string): UIMessageLike {
    return {
        id,
        role: 'user',
        content: text,
        parts: [{ type: 'text', text }],
    }
}

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): JsonRecord | undefined {
    return isRecord(value) ? value : undefined
}

function asArray(value: unknown): unknown[] | undefined {
    return Array.isArray(value) ? value : undefined
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined
}

function asFiniteNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return undefined
}

function positiveNumber(value: unknown): number | undefined {
    const parsed = asFiniteNumber(value)
    return parsed != null && parsed > 0 ? parsed : undefined
}

function getPath(value: unknown, path: string[]): unknown {
    let current = value
    for (const key of path) {
        if (!isRecord(current)) return undefined
        current = current[key]
    }
    return current
}

function arrayOfStrings(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined
    if (!value.every((item) => typeof item === 'string')) return undefined
    return value
}

function stableStringify(value: unknown): string {
    if (value == null || typeof value !== 'object') {
        return JSON.stringify(value)
    }

    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`
    }

    const record = value as JsonRecord
    return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
        .join(',')}}`
}

function equalJson(left: unknown, right: unknown): boolean {
    return stableStringify(left) === stableStringify(right)
}

function collectJsonFromStreamText(text: string): unknown[] {
    const events: unknown[] = []
    const normalized = text.replace(/\r\n/g, '\n')

    function parseCandidate(candidate: string): void {
        const trimmed = candidate.trim()
        if (!trimmed || trimmed === '[DONE]') return

        try {
            events.push(JSON.parse(trimmed))
            return
        } catch {
            // Continue with AI SDK data-stream line formats such as f:{...}.
        }

        const prefixed = trimmed.match(/^[a-zA-Z0-9_-]+:(.*)$/s)
        if (!prefixed) return

        try {
            events.push(JSON.parse(prefixed[1].trim()))
        } catch {
            // Text deltas and partial stream fragments are not JSON metadata.
        }
    }

    for (const block of normalized.split(/\n\n+/)) {
        const lines = block
            .split('\n')
            .map((line) => line.trimEnd())
            .filter(Boolean)
        const dataLines = lines
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice('data:'.length).trimStart())

        if (dataLines.length > 0) {
            parseCandidate(dataLines.join('\n'))
        }

        for (const line of lines) {
            if (!line.startsWith('data:')) parseCandidate(line)
        }
    }

    return events
}

function findStringByKey(value: unknown, key: string): string | undefined {
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findStringByKey(item, key)
            if (found) return found
        }
        return undefined
    }

    if (!isRecord(value)) return undefined

    if (typeof value[key] === 'string') return value[key]

    for (const child of Object.values(value)) {
        const found = findStringByKey(child, key)
        if (found) return found
    }

    return undefined
}

function extractSessionId(events: unknown[]): string | undefined {
    for (const event of events) {
        const direct = findStringByKey(event, 'sessionId')
        if (direct) return direct
    }

    return undefined
}

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url)
    if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(
            `${response.status} ${response.statusText}${body ? `: ${body.slice(0, 500)}` : ''}`,
        )
    }
    return (await response.json()) as T
}

async function readStreamWithTimeout(
    response: Response,
): Promise<{ text: string; bytes: number }> {
    if (!response.body) {
        throw new Error('Response did not include a stream body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const chunks: string[] = []
    let bytes = 0
    let timedOut = false
    const timeout = setTimeout(() => {
        timedOut = true
        reader.cancel('verify stream timeout').catch(() => undefined)
    }, STREAM_TIMEOUT_MS)

    try {
        while (true) {
            const { value, done } = await reader.read()
            if (done) break
            if (!value) continue
            bytes += value.byteLength
            chunks.push(decoder.decode(value, { stream: true }))
        }
        chunks.push(decoder.decode())
    } finally {
        clearTimeout(timeout)
        reader.releaseLock()
    }

    if (timedOut) {
        throw new Error(`Stream timed out after ${STREAM_TIMEOUT_MS}ms`)
    }

    return { text: chunks.join(''), bytes }
}

async function postChat(params: {
    baseUrl: string
    label: 'run1' | 'run2'
    messages: UIMessageLike[]
    sessionId: string | null
    symbol: string
}): Promise<StreamRun> {
    const response = await fetch(`${params.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: params.messages,
            sessionId: params.sessionId,
            symbol: params.symbol,
        }),
    })

    if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(
            `${params.label} /api/chat failed with ${response.status} ${response.statusText}${body ? `: ${body.slice(0, 1000)}` : ''}`,
        )
    }

    const { text, bytes } = await readStreamWithTimeout(response)
    const events = collectJsonFromStreamText(text)

    return {
        label: params.label,
        responseStatus: response.status,
        streamed: true,
        bytes,
        sessionId: extractSessionId(events),
        parsedEvents: events.length,
    }
}

async function loadMessages(
    baseUrl: string,
    sessionId: string,
): Promise<UIMessageLike[]> {
    const json = await fetchJson<{
        success: boolean
        data?: { messages?: UIMessageLike[] } | UIMessageLike[]
        error?: string
    }>(`${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages`)

    if (!json.success) {
        throw new Error(
            json.error ?? 'messages endpoint returned success=false',
        )
    }

    if (Array.isArray(json.data)) return json.data
    const messages = json.data?.messages
    if (!Array.isArray(messages)) {
        throw new Error('messages endpoint did not return data.messages')
    }

    return messages
}

async function waitForMessages(params: {
    baseUrl: string
    sessionId: string
    assistantCount: number
}): Promise<UIMessageLike[]> {
    const deadline = Date.now() + POLL_TIMEOUT_MS
    let lastMessages: UIMessageLike[] = []

    while (Date.now() < deadline) {
        lastMessages = await loadMessages(params.baseUrl, params.sessionId)
        const assistants = lastMessages.filter(
            (message) => message.role === 'assistant',
        )
        if (assistants.length >= params.assistantCount) {
            return lastMessages
        }
        await Bun.sleep(POLL_INTERVAL_MS)
    }

    return lastMessages
}

function runIdFromAssistantMetadata(
    message: UIMessageLike,
): string | undefined {
    return asString(message.metadata?.runId)
}

async function loadTrace(
    baseUrl: string,
    runId: string,
): Promise<JsonRecord | null> {
    const json = await fetchJson<RunTraceResponse>(
        `${baseUrl}/api/runs/${encodeURIComponent(runId)}/trace`,
    )

    if (!json.success) {
        throw new Error(json.error ?? 'trace endpoint returned success=false')
    }

    return asRecord(json.data?.trace) ?? null
}

async function waitForTrace(params: {
    baseUrl: string
    runId: string
}): Promise<JsonRecord | null> {
    const deadline = Date.now() + POLL_TIMEOUT_MS
    let last: JsonRecord | null = null

    while (Date.now() < deadline) {
        last = await loadTrace(params.baseUrl, params.runId)
        if (last) return last
        await Bun.sleep(POLL_INTERVAL_MS)
    }

    return last
}

function latestAssistant(messages: UIMessageLike[]): UIMessageLike | undefined {
    return messages.findLast((message) => message.role === 'assistant')
}

function allAssistants(messages: UIMessageLike[]): UIMessageLike[] {
    return messages.filter((message) => message.role === 'assistant')
}

function textFromMessage(message: UIMessageLike): string {
    const partText =
        message.parts
            ?.filter((part) => part.type === 'text')
            .map((part) => part.text ?? '')
            .join('') ?? ''
    return partText || message.content || ''
}

function cachePlan(trace: JsonRecord): JsonRecord | undefined {
    return asRecord(getPath(trace, ['cache', 'plan']))
}

function cacheResult(trace: JsonRecord): JsonRecord | undefined {
    return asRecord(getPath(trace, ['cache', 'result']))
}

function providerRequest(trace: JsonRecord): JsonRecord | undefined {
    return asRecord(getPath(trace, ['cache', 'providerRequest']))
}

function cacheHashes(plan: JsonRecord): JsonRecord | undefined {
    return asRecord(plan.hashes)
}

function findPositiveNumberByKeys(
    value: unknown,
    keys: Set<string>,
): number | undefined {
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findPositiveNumberByKeys(item, keys)
            if (found != null) return found
        }
        return undefined
    }

    if (!isRecord(value)) return undefined

    for (const [key, child] of Object.entries(value)) {
        if (keys.has(key)) {
            const found = positiveNumber(child)
            if (found != null) return found
        }
    }

    for (const child of Object.values(value)) {
        const found = findPositiveNumberByKeys(child, keys)
        if (found != null) return found
    }

    return undefined
}

function cacheEvidence(
    result: JsonRecord | undefined,
    kind: 'read' | 'write',
): { observed: boolean; source: string; value?: number } {
    if (!result) return { observed: false, source: 'missing cache.result' }

    const flagKey = kind === 'read' ? 'cacheReadObserved' : 'cacheWriteObserved'
    if (result[flagKey] === true) {
        return { observed: true, source: flagKey }
    }

    const tokenKey = kind === 'read' ? 'cacheReadTokens' : 'cacheWriteTokens'
    const tokenValue = positiveNumber(result[tokenKey])
    if (tokenValue != null) {
        return { observed: true, source: tokenKey, value: tokenValue }
    }

    const rawKeys =
        kind === 'read'
            ? new Set([
                  'cacheReadTokens',
                  'cacheReadInputTokens',
                  'cache_read_input_tokens',
              ])
            : new Set([
                  'cacheWriteTokens',
                  'cacheCreationInputTokens',
                  'cacheWriteInputTokens',
                  'cache_creation_input_tokens',
                  'cache_write_input_tokens',
              ])
    const rawValue = findPositiveNumberByKeys(
        result.providerRawCacheUsage,
        rawKeys,
    )
    if (rawValue != null) {
        return {
            observed: true,
            source: `providerRawCacheUsage.${kind}`,
            value: rawValue,
        }
    }

    return { observed: false, source: 'no positive cache evidence' }
}

function optionalFieldFallbackNote(
    result: JsonRecord | undefined,
    kind: 'read' | 'write',
    evidence: { observed: boolean; source: string },
): ReportLine | undefined {
    if (!result || !evidence.observed) return undefined
    const flagKey = kind === 'read' ? 'cacheReadObserved' : 'cacheWriteObserved'
    if (typeof result[flagKey] === 'boolean') return undefined
    if (evidence.source === flagKey) return undefined

    return {
        status: 'INCONCLUSIVE',
        message: `${flagKey} is missing; accepted ${evidence.source} fallback`,
    }
}

function modelIdFromTrace(trace: JsonRecord): string | undefined {
    return asString(getPath(trace, ['result', 'provider', 'modelId']))
}

function providerIdFromTrace(trace: JsonRecord): string | undefined {
    return (
        asString(getPath(trace, ['result', 'provider', 'id'])) ??
        asString(getPath(trace, ['cache', 'plan', 'provider']))
    )
}

function thresholdFromPlan(plan: JsonRecord): number | undefined {
    const candidatePaths = [
        ['effectivePrefixTokenThreshold'],
        ['promptCacheThresholdTokens'],
        ['cacheThresholdTokens'],
        ['minCacheablePrefixTokens'],
        ['minPrefixTokens'],
        ['minPrefixEstimatedTokens'],
        ['providerMinPrefixTokens'],
        ['eligibility', 'effectivePrefixTokenThreshold'],
        ['eligibility', 'promptCacheThresholdTokens'],
        ['eligibility', 'cacheThresholdTokens'],
        ['eligibility', 'minCacheablePrefixTokens'],
        ['eligibility', 'minPrefixTokens'],
        ['eligibility', 'providerMinPrefixTokens'],
    ]

    for (const path of candidatePaths) {
        const value = positiveNumber(getPath(plan, path))
        if (value != null) return value
    }

    const assumptions = asArray(
        getPath(plan, ['eligibility', 'providerRuleAssumptions']),
    )
    for (const assumption of assumptions ?? []) {
        if (typeof assumption !== 'string') continue
        const match = assumption.match(/minPrefix\s*>=\s*(\d+)/i)
        if (match) return Number(match[1])
    }

    return undefined
}

function add(
    lines: ReportLine[],
    condition: boolean,
    passMessage: string,
    failMessage: string,
): void {
    lines.push({
        status: condition ? 'PASS' : 'FAIL',
        message: condition ? passMessage : failMessage,
    })
}

function validateTracePair(params: {
    run1Trace: JsonRecord | undefined
    run2Trace: JsonRecord | undefined
}): ReportLine[] {
    const lines: ReportLine[] = []
    const { run1Trace, run2Trace } = params

    if (!run1Trace || !run2Trace) {
        add(lines, false, '', 'both run traces must exist')
        return lines
    }

    const run1Plan = cachePlan(run1Trace)
    const run2Plan = cachePlan(run2Trace)
    const run1Result = cacheResult(run1Trace)
    const run2Result = cacheResult(run2Trace)
    const run1ProviderRequest = providerRequest(run1Trace)
    const run2ProviderRequest = providerRequest(run2Trace)

    add(
        lines,
        Boolean(run1Plan),
        'run1 cache.plan exists',
        'run1 cache.plan missing',
    )
    add(
        lines,
        Boolean(run2Plan),
        'run2 cache.plan exists',
        'run2 cache.plan missing',
    )
    add(
        lines,
        Boolean(run1Result),
        'run1 cache.result exists',
        'run1 cache.result missing',
    )
    add(
        lines,
        Boolean(run2Result),
        'run2 cache.result exists',
        'run2 cache.result missing',
    )
    add(
        lines,
        Boolean(run1ProviderRequest),
        'run1 cache.providerRequest exists',
        'run1 cache.providerRequest missing',
    )
    add(
        lines,
        Boolean(run2ProviderRequest),
        'run2 cache.providerRequest exists',
        'run2 cache.providerRequest missing',
    )

    if (!run1Plan || !run2Plan || !run1Result || !run2Result) return lines

    add(
        lines,
        run1Result.rolloutGateStatus === 'enabled',
        'run1 rolloutGateStatus enabled',
        `run1 rolloutGateStatus expected enabled, got ${String(
            run1Result.rolloutGateStatus,
        )}`,
    )
    add(
        lines,
        run2Result.rolloutGateStatus === 'enabled',
        'run2 rolloutGateStatus enabled',
        `run2 rolloutGateStatus expected enabled, got ${String(
            run2Result.rolloutGateStatus,
        )}`,
    )

    const writeEvidence = cacheEvidence(run1Result, 'write')
    add(
        lines,
        writeEvidence.observed,
        `run1 write evidence observed via ${writeEvidence.source}${
            writeEvidence.value != null ? `=${writeEvidence.value}` : ''
        }`,
        `run1 write evidence missing (${writeEvidence.source})`,
    )
    const writeNote = optionalFieldFallbackNote(
        run1Result,
        'write',
        writeEvidence,
    )
    if (writeNote) lines.push(writeNote)

    const readEvidence = cacheEvidence(run2Result, 'read')
    add(
        lines,
        readEvidence.observed,
        `run2 read evidence observed via ${readEvidence.source}${
            readEvidence.value != null ? `=${readEvidence.value}` : ''
        }`,
        `run2 read evidence missing (${readEvidence.source})`,
    )
    const readNote = optionalFieldFallbackNote(run2Result, 'read', readEvidence)
    if (readNote) lines.push(readNote)

    const provider1 = providerIdFromTrace(run1Trace)
    const provider2 = providerIdFromTrace(run2Trace)
    add(
        lines,
        Boolean(provider1 && provider2 && provider1 === provider2),
        `provider matched: ${provider1}`,
        `provider mismatch or missing: run1=${String(provider1)} run2=${String(
            provider2,
        )}`,
    )

    const model1 = modelIdFromTrace(run1Trace)
    const model2 = modelIdFromTrace(run2Trace)
    if (model1 || model2) {
        add(
            lines,
            model1 === model2,
            `model matched: ${model1}`,
            `model mismatch: run1=${String(model1)} run2=${String(model2)}`,
        )
    } else {
        lines.push({
            status: 'INCONCLUSIVE',
            message:
                'trace result provider modelId is missing; provider and stable prefix checks were used',
        })
    }

    const hashes1 = cacheHashes(run1Plan)
    const hashes2 = cacheHashes(run2Plan)
    for (const key of ['systemHash', 'memoryHash', 'toolDefinitionsHash']) {
        const left = hashes1?.[key]
        const right = hashes2?.[key]
        add(
            lines,
            typeof left === 'string' && left === right,
            `${key} matched`,
            `${key} mismatch or missing: run1=${String(left)} run2=${String(
                right,
            )}`,
        )
    }

    const dynamic1 = hashes1?.dynamicTailHash
    const dynamic2 = hashes2?.dynamicTailHash
    lines.push({
        status: 'INCONCLUSIVE',
        message:
            typeof dynamic1 === 'string' && typeof dynamic2 === 'string'
                ? `dynamicTailHash observed but not required to match: run1=${dynamic1.slice(
                      0,
                      12,
                  )} run2=${dynamic2.slice(0, 12)}`
                : 'dynamicTailHash missing; it is not required for acceptance',
    })

    const prefix1 = arrayOfStrings(run1Plan.effectivePrefixSegmentIds)
    const prefix2 = arrayOfStrings(run2Plan.effectivePrefixSegmentIds)
    add(
        lines,
        Boolean(prefix1 && prefix2 && equalJson(prefix1, prefix2)),
        `effectivePrefixSegmentIds matched: ${(prefix1 ?? []).join(',')}`,
        `effectivePrefixSegmentIds mismatch or missing: run1=${stableStringify(
            prefix1,
        )} run2=${stableStringify(prefix2)}`,
    )

    for (const [label, plan] of [
        ['run1', run1Plan],
        ['run2', run2Plan],
    ] as const) {
        add(
            lines,
            getPath(plan, ['eligibility', 'cacheExpected']) === true,
            `${label} cache.plan eligibility cacheExpected=true`,
            `${label} cache.plan eligibility cacheExpected must be true`,
        )

        const tokens = asFiniteNumber(plan.effectivePrefixEstimatedTokens)
        add(
            lines,
            tokens != null && tokens > 0,
            `${label} effectivePrefixEstimatedTokens=${tokens}`,
            `${label} effectivePrefixEstimatedTokens missing or invalid`,
        )

        const threshold = thresholdFromPlan(plan)
        if (threshold != null && tokens != null) {
            add(
                lines,
                tokens >= threshold,
                `${label} effective prefix tokens ${tokens} >= threshold ${threshold}`,
                `${label} effective prefix tokens ${tokens} below threshold ${threshold}`,
            )
        } else {
            lines.push({
                status: 'INCONCLUSIVE',
                message: `${label} trace threshold field missing; relied on cacheExpected eligibility`,
            })
        }
    }

    return lines
}

function printReport(params: {
    baseUrl: string
    runId: string
    symbol: string
    sessionId?: string
    run1?: StreamRun
    run2?: StreamRun
    assistant1?: UIMessageLike
    assistant2?: UIMessageLike
    lines: ReportLine[]
}): void {
    const failures = params.lines.filter((line) => line.status === 'FAIL')
    const inconclusive = params.lines.filter(
        (line) => line.status === 'INCONCLUSIVE',
    )

    console.log('Prompt cache chat flow verification')
    console.log(`Server: ${params.baseUrl}`)
    console.log(`Run id: ${params.runId}`)
    console.log(`Symbol: ${params.symbol}`)
    if (params.sessionId) console.log(`Session: ${params.sessionId}`)
    if (params.run1) {
        console.log(
            `Run1 stream: status=${params.run1.responseStatus} bytes=${params.run1.bytes} parsedEvents=${params.run1.parsedEvents}`,
        )
    }
    if (params.run2) {
        console.log(
            `Run2 stream: status=${params.run2.responseStatus} bytes=${params.run2.bytes} parsedEvents=${params.run2.parsedEvents}`,
        )
    }
    if (params.assistant1) {
        console.log(
            `Run1 assistant: ${params.assistant1.id} textChars=${
                textFromMessage(params.assistant1).length
            }`,
        )
    }
    if (params.assistant2) {
        console.log(
            `Run2 assistant: ${params.assistant2.id} textChars=${
                textFromMessage(params.assistant2).length
            }`,
        )
    }
    console.log('')
    console.log(`Result: ${failures.length > 0 ? 'FAIL' : 'PASS'}`)

    for (const line of params.lines) {
        const prefix =
            line.status === 'PASS'
                ? '[PASS]'
                : line.status === 'FAIL'
                  ? '[FAIL]'
                  : '[INCONCLUSIVE]'
        console.log(`${prefix} ${line.message}`)
    }

    if (inconclusive.length > 0 && failures.length === 0) {
        console.log('')
        console.log(
            'Inconclusive lines are optional/new trace fields with backward-compatible fallback evidence.',
        )
    }
}

async function main(): Promise<void> {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log(usage())
        return
    }

    const baseUrl = serverUrl()
    const runId = `pcache-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`
    const symbol = `PCACHE${runId.slice(-6).toUpperCase()}`
    const firstText = [
        `Verification prefix ${runId}.`,
        'Reply with exactly one short sentence.',
        'Do not call tools unless required.',
    ].join(' ')
    const secondText = [
        `Verification prefix ${runId}, second turn.`,
        'Reply with exactly one short sentence and mention this is turn two.',
        'Do not call tools unless required.',
    ].join(' ')
    const firstUser = createUserMessage(`${runId}-user-1`, firstText)
    const secondUser = createUserMessage(`${runId}-user-2`, secondText)
    const lines: ReportLine[] = []

    let run1: StreamRun | undefined
    let run2: StreamRun | undefined
    let sessionId: string | undefined
    let assistant1: UIMessageLike | undefined
    let assistant2: UIMessageLike | undefined
    let run1Trace: JsonRecord | undefined
    let run2Trace: JsonRecord | undefined

    try {
        run1 = await postChat({
            baseUrl,
            label: 'run1',
            messages: [firstUser],
            sessionId: null,
            symbol,
        })
        sessionId = run1.sessionId
        add(
            lines,
            run1.streamed && run1.bytes > 0,
            'run1 stream completed',
            'run1 stream did not complete or was empty',
        )
        add(
            lines,
            Boolean(sessionId),
            `run1 stream exposed sessionId ${sessionId}`,
            'run1 stream did not expose sessionId metadata',
        )

        if (!sessionId) {
            throw new Error('Cannot continue without sessionId from run1')
        }

        const messagesAfterRun1 = await waitForMessages({
            baseUrl,
            sessionId,
            assistantCount: 1,
        })
        assistant1 = latestAssistant(messagesAfterRun1)
        add(
            lines,
            Boolean(assistant1),
            `run1 assistant message persisted: ${assistant1?.id}`,
            'run1 did not persist an assistant message',
        )

        const fullHistoryForRun2 = [...messagesAfterRun1, secondUser]
        run2 = await postChat({
            baseUrl,
            label: 'run2',
            messages: fullHistoryForRun2,
            sessionId,
            symbol,
        })
        add(
            lines,
            run2.streamed && run2.bytes > 0,
            'run2 stream completed',
            'run2 stream did not complete or was empty',
        )

        const messagesAfterRun2 = await waitForMessages({
            baseUrl,
            sessionId,
            assistantCount: 2,
        })
        const assistants = allAssistants(messagesAfterRun2)
        assistant2 = assistants.find((message) => message.id !== assistant1?.id)
        add(
            lines,
            Boolean(assistant2),
            `run2 assistant message persisted: ${assistant2?.id}`,
            'run2 did not persist a second assistant message',
        )

        if (assistant1) {
            const assistantRunId = runIdFromAssistantMetadata(assistant1)
            add(
                lines,
                Boolean(assistantRunId),
                `run1 assistant metadata exposed runId ${assistantRunId}`,
                `run1 assistant metadata missing runId for ${assistant1.id}`,
            )
            if (assistantRunId) {
                run1Trace =
                    (await waitForTrace({
                        baseUrl,
                        runId: assistantRunId,
                    })) ?? undefined
            }
            add(
                lines,
                Boolean(run1Trace),
                `run1 trace exists for ${assistant1.id}`,
                `run1 trace missing for ${assistant1.id}`,
            )
        }

        if (assistant2) {
            const assistantRunId = runIdFromAssistantMetadata(assistant2)
            add(
                lines,
                Boolean(assistantRunId),
                `run2 assistant metadata exposed runId ${assistantRunId}`,
                `run2 assistant metadata missing runId for ${assistant2.id}`,
            )
            if (assistantRunId) {
                run2Trace =
                    (await waitForTrace({
                        baseUrl,
                        runId: assistantRunId,
                    })) ?? undefined
            }
            add(
                lines,
                Boolean(run2Trace),
                `run2 trace exists for ${assistant2.id}`,
                `run2 trace missing for ${assistant2.id}`,
            )
        }

        lines.push(
            ...validateTracePair({
                run1Trace,
                run2Trace,
            }),
        )
    } catch (error) {
        lines.push({
            status: 'FAIL',
            message:
                error instanceof Error
                    ? error.message
                    : `Unexpected error: ${String(error)}`,
        })
    }

    printReport({
        baseUrl,
        runId,
        symbol,
        sessionId,
        run1,
        run2,
        assistant1,
        assistant2,
        lines,
    })

    if (lines.some((line) => line.status === 'FAIL')) {
        process.exitCode = 1
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
