import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const { DocEditor } = await import('@/components/memory/DocEditor')
const { ConfirmDialog } = await import('@/components/memory/ConfirmDialog')

afterEach(() => {
    cleanup()
})

describe('DocEditor dirty detection', () => {
    it('save button disabled when content unchanged', () => {
        const onSave = mock(() => {})
        const onCancel = mock(() => {})
        render(
            <DocEditor
                content='hello'
                saving={false}
                onSave={onSave}
                onCancel={onCancel}
            />,
        )
        const saveBtn = screen.getByRole('button', { name: /保存|save/i })
        expect(saveBtn.hasAttribute('disabled')).toBe(true)
    })

    it('save button enabled when content modified', () => {
        const onSave = mock(() => {})
        const onCancel = mock(() => {})
        render(
            <DocEditor
                content='hello'
                saving={false}
                onSave={onSave}
                onCancel={onCancel}
            />,
        )
        const textarea = screen.getByRole('textbox')
        fireEvent.change(textarea, { target: { value: 'hello world' } })
        expect(
            screen
                .getByRole('button', { name: /保存|save/i })
                .hasAttribute('disabled'),
        ).toBe(false)
    })

    it('calls onSave with new content when save clicked', () => {
        const onSave = mock(() => {})
        const onCancel = mock(() => {})
        render(
            <DocEditor
                content='hello'
                saving={false}
                onSave={onSave}
                onCancel={onCancel}
            />,
        )
        const textarea = screen.getByRole('textbox')
        fireEvent.change(textarea, { target: { value: 'updated' } })
        fireEvent.click(screen.getByRole('button', { name: /保存|save/i }))
        expect(onSave).toHaveBeenCalledWith('updated')
    })

    it('save button disabled while saving', () => {
        const onSave = mock(() => {})
        const onCancel = mock(() => {})
        render(
            <DocEditor
                content='hello'
                saving={true}
                onSave={onSave}
                onCancel={onCancel}
            />,
        )
        const textarea = screen.getByRole('textbox')
        fireEvent.change(textarea, { target: { value: 'changed' } })
        expect(
            screen
                .getByRole('button', { name: /保存|save/i })
                .hasAttribute('disabled'),
        ).toBe(true)
    })
})

describe('ConfirmDialog', () => {
    it('renders nothing when open is false', () => {
        const { container } = render(
            <ConfirmDialog
                open={false}
                title='Delete?'
                message='Are you sure?'
                onConfirm={() => {}}
                onCancel={() => {}}
            />,
        )
        expect(container.innerHTML).toBe('')
    })

    it('renders title and message when open', () => {
        render(
            <ConfirmDialog
                open={true}
                title='Delete?'
                message='Are you sure?'
                onConfirm={() => {}}
                onCancel={() => {}}
            />,
        )
        expect(screen.getByText('Delete?')).toBeTruthy()
        expect(screen.getByText('Are you sure?')).toBeTruthy()
    })

    it('calls onConfirm when confirm button clicked', () => {
        const onConfirm = mock(() => {})
        render(
            <ConfirmDialog
                open={true}
                title='Delete?'
                message='Are you sure?'
                onConfirm={onConfirm}
                onCancel={() => {}}
            />,
        )
        fireEvent.click(
            screen.getByRole('button', { name: /确认|confirm|delete/i }),
        )
        expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it('uses destructive style when destructive=true', () => {
        render(
            <ConfirmDialog
                open={true}
                title='Delete?'
                message='Are you sure?'
                destructive={true}
                onConfirm={() => {}}
                onCancel={() => {}}
            />,
        )
        expect(
            screen.getByRole('button', { name: /确认|confirm|delete/i })
                .className,
        ).toContain('rose')
    })
})
