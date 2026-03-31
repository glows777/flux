import { afterEach, describe, expect, it, mock, beforeEach } from 'bun:test'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

const { CreateDocDialog } = await import('@/components/dev/CreateDocDialog')

afterEach(() => {
    cleanup()
})

describe('CreateDocDialog', () => {
    it('renders nothing when open is false', () => {
        const { container } = render(
            <CreateDocDialog
                open={false}
                onClose={() => {}}
                onCreated={() => {}}
            />,
        )
        expect(container.innerHTML).toBe('')
    })

    it('renders input fields when open', () => {
        render(
            <CreateDocDialog
                open={true}
                onClose={() => {}}
                onCreated={() => {}}
            />,
        )
        expect(screen.getByPlaceholderText(/文档路径/)).toBeTruthy()
        expect(screen.getByPlaceholderText(/初始内容/)).toBeTruthy()
    })

    it('disables create button when path is empty', () => {
        render(
            <CreateDocDialog
                open={true}
                onClose={() => {}}
                onCreated={() => {}}
            />,
        )
        const createBtn = screen.getByRole('button', { name: /创建/i })
        expect(createBtn.hasAttribute('disabled')).toBe(true)
    })

    it('enables create button when path has value', () => {
        render(
            <CreateDocDialog
                open={true}
                onClose={() => {}}
                onCreated={() => {}}
            />,
        )
        const pathInput = screen.getByPlaceholderText(/文档路径/)
        fireEvent.change(pathInput, { target: { value: 'opinions/MSFT.md' } })
        const createBtn = screen.getByRole('button', { name: /创建/i })
        expect(createBtn.hasAttribute('disabled')).toBe(false)
    })

    it('calls onCreated with path after successful creation', async () => {
        const onCreated = mock(() => {})
        const onClose = mock(() => {})
        const originalFetch = globalThis.fetch
        globalThis.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 201 })),
        ) as unknown as typeof fetch

        render(
            <CreateDocDialog
                open={true}
                onClose={onClose}
                onCreated={onCreated}
            />,
        )

        const pathInput = screen.getByPlaceholderText(/文档路径/)
        fireEvent.change(pathInput, { target: { value: 'opinions/MSFT.md' } })
        const createBtn = screen.getByRole('button', { name: /创建/i })
        fireEvent.click(createBtn)

        await waitFor(() => {
            expect(onCreated).toHaveBeenCalledWith('opinions/MSFT.md')
        })
        expect(onClose).toHaveBeenCalledTimes(1)

        globalThis.fetch = originalFetch
    })

    it('calls onClose when cancel button clicked', () => {
        const onClose = mock(() => {})
        render(
            <CreateDocDialog
                open={true}
                onClose={onClose}
                onCreated={() => {}}
            />,
        )
        const cancelBtn = screen.getByRole('button', { name: /取消/i })
        fireEvent.click(cancelBtn)
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
