const DAY_MS = 24 * 60 * 60 * 1000

export class NotificationDedup {
	private sent = new Map<string, number>()

	isDuplicate(jobId: string, content: string): boolean {
		this.evictStale()
		const key = Bun.hash(`${jobId}:${content}`).toString(36)
		if (this.sent.has(key)) return true
		this.sent.set(key, Date.now())
		return false
	}

	private evictStale(): void {
		const now = Date.now()
		for (const [key, ts] of this.sent) {
			if (now - ts > DAY_MS) this.sent.delete(key)
		}
	}
}
