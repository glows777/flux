export type AgentRunStatus =
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'cancelled'

export type AgentRunSource =
    | 'web'
    | 'discord'
    | 'cron'
    | 'background'
    | 'sub_agent'

export type AgentRunMode = 'conversation' | 'trigger'

export interface AgentRunUsage {
    inputTokens?: number
    outputTokens?: number
}

export interface AgentRunErrorRecord {
    message: string
    name: string
    code?: string
}

export interface AgentRunWarning {
    source: string
    message: string
}

export interface CreateRunningRunInput {
    runId: string
    source: AgentRunSource
    mode: AgentRunMode
    agentType: string
    sessionId?: string
    messageId?: string
    cronJobId?: string
    parentRunId?: string
    userId?: string
    sourceId?: string
    inputSummary?: string
}

export interface CreateFailedRunInput
    extends Omit<CreateRunningRunInput, 'runId'> {
    runId?: string
    error: unknown
    code?: string
}

export interface SucceedRunInput {
    messageId?: string
    outputSummary?: string
    usage?: AgentRunUsage
}

export interface FailRunInput {
    error: unknown
    code?: string
    sessionId?: string
}

export interface AgentRunStore {
    createRunningRun(input: CreateRunningRunInput): Promise<void>
    createFailedRun(input: CreateFailedRunInput): Promise<{ runId: string }>
    attachSession(runId: string, sessionId: string): Promise<void>
    succeedIfRunning(runId: string, input: SucceedRunInput): Promise<void>
    failIfRunning(runId: string, input: FailRunInput): Promise<void>
    recordWarnings(runId: string, warnings: AgentRunWarning[]): Promise<void>
    reconcileStaleRunningRuns(input: {
        olderThan: Date
        reason?: string
    }): Promise<{ count: number }>
}
