import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const schemaPath = join(import.meta.dir, '../../../prisma/schema.prisma')

describe('AgentRun Prisma schema', () => {
	test('defines the run ledger model and indexes', () => {
		const schema = readFileSync(schemaPath, 'utf-8')

		expect(schema).toContain('model AgentRun {')
		expect(schema).toContain('id            String   @id')
		expect(schema).toContain('status        String')
		expect(schema).toContain('source        String')
		expect(schema).toContain('mode          String')
		expect(schema).toContain('agentType     String')
		expect(schema).toContain('sessionId     String?')
		expect(schema).toContain('messageId     String?')
		expect(schema).toContain('cronJobId     String?')
		expect(schema).toContain('parentRunId   String?')
		expect(schema).toContain('inputSummary  String?  @db.Text')
		expect(schema).toContain('outputSummary String?  @db.Text')
		expect(schema).toContain('error         Json?')
		expect(schema).toContain('usage         Json?')
		expect(schema).toContain('warnings      Json?')
		expect(schema).toContain('@@index([status, startedAt])')
		expect(schema).toContain('@@index([source, startedAt])')
		expect(schema).toContain('@@index([sessionId, startedAt])')
		expect(schema).toContain('@@index([cronJobId, startedAt])')
		expect(schema).toContain('@@index([parentRunId, startedAt])')
		const manifestModel = schema.match(
			/model ChatMessageManifest \{[\s\S]*?\n\}/,
		)?.[0]
		expect(manifestModel).toBeDefined()
		expect(manifestModel).toContain('runId     String   @unique')
		expect(manifestModel).toContain('@@index([sessionId, messageId, createdAt])')
		expect(manifestModel).not.toContain('@@unique([sessionId, messageId])')
	})
})
