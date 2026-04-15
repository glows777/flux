import { describe, expect, test } from 'bun:test'
import { MemoryStore } from '@/core/market-data/common/store-memory'

describe('MemoryStore', () => {
    test('returns null for missing key', async () => {
        const store = new MemoryStore<string>()
        expect(await store.get('missing')).toBeNull()
    })

    test('stores and retrieves value with fetchedAt', async () => {
        const store = new MemoryStore<string>()
        await store.set('key1', 'value1')
        const entry = await store.get('key1')
        expect(entry).not.toBeNull()
        if (!entry) throw new Error('Expected entry to exist')
        expect(entry.data).toBe('value1')
        expect(entry.fetchedAt).toBeInstanceOf(Date)
    })

    test('overwrites existing value', async () => {
        const store = new MemoryStore<number>()
        await store.set('k', 1)
        await store.set('k', 2)
        const entry = await store.get('k')
        if (!entry) throw new Error('Expected updated entry to exist')
        expect(entry.data).toBe(2)
    })
})
