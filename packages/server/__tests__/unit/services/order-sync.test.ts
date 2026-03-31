import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { handleOrderUpdate } from '@/core/services/order-sync'

function makeDb() {
    return {
        order: {
            findUnique: mock(async () => null),
            update: mock(async () => ({})),
            create: mock(async () => ({})),
        },
    }
}

function makeEvent(overrides = {}) {
    return {
        event: 'fill',
        order: {
            id: 'alpaca-1',
            symbol: 'AAPL',
            qty: '10',
            side: 'buy',
            type: 'limit',
            status: 'filled',
            filled_qty: '10',
            filled_avg_price: '185.20',
            limit_price: '185.00',
            stop_price: null,
            trail_percent: null,
            time_in_force: 'day',
            created_at: '2026-03-27T10:00:00Z',
            filled_at: '2026-03-27T14:30:00Z',
            ...overrides,
        },
    }
}

describe('handleOrderUpdate', () => {
    it('updates existing order when status changes', async () => {
        const db = makeDb()
        db.order.findUnique = mock(async () => ({
            alpacaOrderId: 'alpaca-1',
            status: 'new',
        }))
        const notifyOrderEvent = mock(async () => {})

        const event = makeEvent({ status: 'filled' })
        await handleOrderUpdate(event, { db, notifyOrderEvent })

        expect(db.order.update).toHaveBeenCalledTimes(1)
        expect(db.order.create).not.toHaveBeenCalled()

        const updateCall = db.order.update.mock.calls[0][0]
        expect(updateCall.where).toEqual({ alpacaOrderId: 'alpaca-1' })
        expect(updateCall.data.status).toBe('filled')
    })

    it('creates new order for unknown alpacaOrderId', async () => {
        const db = makeDb()
        // findUnique returns null (default) — unknown order
        const notifyOrderEvent = mock(async () => {})

        const event = makeEvent()
        await handleOrderUpdate(event, { db, notifyOrderEvent })

        expect(db.order.create).toHaveBeenCalledTimes(1)
        expect(db.order.update).not.toHaveBeenCalled()

        const createCall = db.order.create.mock.calls[0][0]
        expect(createCall.data.alpacaOrderId).toBe('alpaca-1')
        expect(createCall.data.symbol).toBe('AAPL')
        expect(createCall.data.reasoning).toBe('外部下单')
    })

    it('sends Discord notification', async () => {
        const db = makeDb()
        const notifyOrderEvent = mock(async () => {})

        const event = makeEvent()
        await handleOrderUpdate(event, { db, notifyOrderEvent })

        expect(notifyOrderEvent).toHaveBeenCalledTimes(1)
        const notifyCall = notifyOrderEvent.mock.calls[0][0]
        expect(notifyCall.event).toBe('fill')
        expect(notifyCall.symbol).toBe('AAPL')
        expect(notifyCall.side).toBe('buy')
        expect(notifyCall.qty).toBe(10)
    })

    it('skips update when status unchanged', async () => {
        const db = makeDb()
        db.order.findUnique = mock(async () => ({
            alpacaOrderId: 'alpaca-1',
            status: 'filled',
        }))
        const notifyOrderEvent = mock(async () => {})

        const event = makeEvent({ status: 'filled' })
        await handleOrderUpdate(event, { db, notifyOrderEvent })

        expect(db.order.update).not.toHaveBeenCalled()
        expect(db.order.create).not.toHaveBeenCalled()
    })

    it('always sends notification even when status unchanged', async () => {
        const db = makeDb()
        db.order.findUnique = mock(async () => ({
            alpacaOrderId: 'alpaca-1',
            status: 'filled',
        }))
        const notifyOrderEvent = mock(async () => {})

        const event = makeEvent({ status: 'filled' })
        await handleOrderUpdate(event, { db, notifyOrderEvent })

        expect(notifyOrderEvent).toHaveBeenCalledTimes(1)
    })
})
