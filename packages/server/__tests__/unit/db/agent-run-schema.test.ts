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
	test('defines the run ledger model and indexes', () => {
		const schema = readFileSync(schemaPath, 'utf-8')
		const agentRunModel = extractModelBlock(schema, 'AgentRun')
		const manifestModel = extractModelBlock(schema, 'ChatMessageManifest')

		expect(agentRunModel).toContain('model AgentRun {')
		expect(agentRunModel).toContain('id            String   @id')
		expect(agentRunModel).toContain('status        String')
		expect(agentRunModel).toContain('source        String')
		expect(agentRunModel).toContain('mode          String')
		expect(agentRunModel).toContain('agentType     String')
		expect(agentRunModel).toContain('sessionId     String?')
		expect(agentRunModel).toContain('messageId     String?')
		expect(agentRunModel).toContain('cronJobId     String?')
		expect(agentRunModel).toContain('parentRunId   String?')
		expect(agentRunModel).toContain('userId        String?')
		expect(agentRunModel).toContain('sourceId      String?')
		expect(agentRunModel).toContain('inputSummary  String?  @db.Text')
		expect(agentRunModel).toContain('outputSummary String?  @db.Text')
		expect(agentRunModel).toContain('error         Json?')
		expect(agentRunModel).toContain('usage         Json?')
		expect(agentRunModel).toContain('warnings      Json?')
		expect(agentRunModel).toContain('startedAt     DateTime @default(now())')
		expect(agentRunModel).toContain('finishedAt    DateTime?')
		expect(agentRunModel).toContain('durationMs    Int?')
		expect(agentRunModel).toContain('createdAt     DateTime @default(now())')
		expect(agentRunModel).toContain('updatedAt     DateTime @updatedAt')
		expect(agentRunModel).toContain('@@index([status, startedAt])')
		expect(agentRunModel).toContain('@@index([source, startedAt])')
		expect(agentRunModel).toContain('@@index([sessionId, startedAt])')
		expect(agentRunModel).toContain('@@index([cronJobId, startedAt])')
		expect(agentRunModel).toContain('@@index([parentRunId, startedAt])')

		expect(manifestModel).toContain('runId     String   @unique')
		expect(manifestModel).toContain('@@index([sessionId, messageId, createdAt])')
		expect(manifestModel).not.toContain('@@unique([sessionId, messageId])')
	})
})
