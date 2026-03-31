import { describe, expect, test, beforeEach } from 'bun:test'
import { NotificationDedup } from '@/scheduler/dedup'

describe('NotificationDedup', () => {
	let dedup: NotificationDedup

	beforeEach(() => {
		dedup = new NotificationDedup()
	})

	test('first occurrence is not a duplicate', () => {
		expect(dedup.isDuplicate('job-1', 'NVDA is up 5%')).toBe(false)
	})

	test('same jobId + content within 24h is a duplicate', () => {
		dedup.isDuplicate('job-1', 'NVDA is up 5%')
		expect(dedup.isDuplicate('job-1', 'NVDA is up 5%')).toBe(true)
	})

	test('same content but different jobId is NOT a duplicate', () => {
		dedup.isDuplicate('job-1', 'NVDA is up 5%')
		expect(dedup.isDuplicate('job-2', 'NVDA is up 5%')).toBe(false)
	})

	test('same jobId but different content is NOT a duplicate', () => {
		dedup.isDuplicate('job-1', 'NVDA is up 5%')
		expect(dedup.isDuplicate('job-1', 'NVDA is down 3%')).toBe(false)
	})
})
