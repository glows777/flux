import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'

const { DocEditor } = await import('@/components/dev/DocEditor')
const { ConfirmDialog } = await import('@/components/dev/ConfirmDialog')

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
        const saveBtn = screen.getByRole('button', { name: /保存|save/i })
        expect(saveBtn.hasAttribute('disabled')).toBe(false)
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
        const saveBtn = screen.getByRole('button', { name: /保存|save/i })
        fireEvent.click(saveBtn)
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
        const saveBtn = screen.getByRole('button', { name: /保存|save/i })
        expect(saveBtn.hasAttribute('disabled')).toBe(true)
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
        const confirmBtn = screen.getByRole('button', { name: /确认|confirm|delete/i })
        fireEvent.click(confirmBtn)
        expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it('calls onCancel when cancel button clicked', () => {
        const onCancel = mock(() => {})
        render(
            <ConfirmDialog
                open={true}
                title='Delete?'
                message='Are you sure?'
                onConfirm={() => {}}
                onCancel={onCancel}
            />,
        )
        const cancelBtn = screen.getByRole('button', { name: /取消|cancel/i })
        fireEvent.click(cancelBtn)
        expect(onCancel).toHaveBeenCalledTimes(1)
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
        const confirmBtn = screen.getByRole('button', { name: /确认|confirm|delete/i })
        expect(confirmBtn.className).toContain('rose')
    })
})
