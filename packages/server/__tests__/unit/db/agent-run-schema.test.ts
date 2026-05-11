import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const schemaPath = join(import.meta.dir, '../../../prisma/schema.prisma')

function extractModelBlock(schema: string, modelName: string): string {
    const model = schema.match(
        new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`),
    )?.[0]
    expect(model).toBeDefined()

    return model as string
}

describe('AgentRun Prisma schema', () => {
    test('defines run ledger and run trace with restricted deletion', () => {
        const schema = readFileSync(schemaPath, 'utf-8')
        const agentRunModel = extractModelBlock(schema, 'AgentRun')
        const traceModel = extractModelBlock(schema, 'AgentRunTrace')

        expect(schema).not.toContain('model ChatMessageManifest')
        expect(schema).not.toContain('manifests ChatMessageManifest[]')

        expect(agentRunModel).toContain('trace         AgentRunTrace?')
        expect(agentRunModel).toContain('id            String   @id')
        expect(agentRunModel).toContain('status        String')
        expect(agentRunModel).toContain('warnings      Json?')
        expect(agentRunModel).toContain('@@index([status, startedAt])')
        expect(agentRunModel).toContain('@@index([source, startedAt])')
        expect(agentRunModel).toContain('@@index([sessionId, startedAt])')
        expect(agentRunModel).toContain('@@index([cronJobId, startedAt])')
        expect(agentRunModel).toContain('@@index([parentRunId, startedAt])')

        expect(traceModel).toContain('runId     String   @unique')
        expect(traceModel).toContain('status    String')
        expect(traceModel).toContain('phase     String')
        expect(traceModel).toContain('payload   Json')
        expect(traceModel).toContain('onDelete: Restrict')
        expect(traceModel).toContain('@@index([status, updatedAt])')
        expect(traceModel).toContain('@@index([phase, updatedAt])')
    })
})
