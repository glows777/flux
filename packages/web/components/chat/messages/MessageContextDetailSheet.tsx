'use client'

import { ChevronDown, ChevronRight, RefreshCcw, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import type {
    MessageContextSegment,
    MessageContextState,
} from '@/lib/ai/context-visibility'
import {
    buildSegmentGroups,
    formatSegmentSource,
    formatSerializableContent,
} from '@/lib/ai/context-visibility'

const DESKTOP_MEDIA_QUERY = '(min-width: 768px)'
const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ')

function useMatchesMediaQuery(query: string) {
    const getMatches = () =>
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia(query).matches

    const [matches, setMatches] = useState(getMatches)

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        const mediaQuery = window.matchMedia(query)
        const handleChange = (event: MediaQueryListEvent) => {
            setMatches(event.matches)
        }

        setMatches(mediaQuery.matches)
        mediaQuery.addEventListener('change', handleChange)

        return () => mediaQuery.removeEventListener('change', handleChange)
    }, [query])

    return matches
}

function formatFlagLabel(value: boolean | undefined) {
    if (value === true) return 'Included'
    if (value === false) return 'Excluded'
    return null
}

function SegmentMetadata({
    label,
    value,
}: {
    readonly label: string
    readonly value: string | number
}) {
    return (
        <div className='rounded-lg border border-white/6 bg-white/[0.03] px-3 py-2'>
            <p className='text-[11px] uppercase tracking-[0.16em] text-slate-500'>
                {label}
            </p>
            <p className='mt-1 text-xs text-slate-200'>{value}</p>
        </div>
    )
}

function JsonBlock({
    value,
    emptyLabel = '—',
}: {
    readonly value: unknown
    readonly emptyLabel?: string
}) {
    const content = formatSerializableContent(value)

    return (
        <pre className='whitespace-pre-wrap break-words rounded-xl border border-white/6 bg-black/30 p-3 font-mono text-[12px] leading-5 text-slate-300'>
            {content || emptyLabel}
        </pre>
    )
}

function Section({
    title,
    children,
}: {
    readonly title: string
    readonly children: ReactNode
}) {
    return (
        <section className='rounded-2xl border border-white/8 bg-white/[0.03] p-4'>
            <h2 className='text-sm font-medium text-slate-100'>{title}</h2>
            <div className='mt-3'>{children}</div>
        </section>
    )
}

function DiagnosticCard({
    title,
    value,
}: {
    readonly title: string
    readonly value: unknown
}) {
    return (
        <div className='rounded-xl border border-white/6 bg-black/20 p-3'>
            <p className='text-xs uppercase tracking-[0.16em] text-slate-500'>
                {title}
            </p>
            <div className='mt-2'>
                <JsonBlock value={value} />
            </div>
        </div>
    )
}

function SegmentCard({
    segment,
    isOpen,
    onOpenChange,
}: {
    readonly segment: MessageContextSegment
    readonly isOpen: boolean
    readonly onOpenChange: (nextOpen: boolean) => void
}) {
    const inclusionLabel = formatFlagLabel(segment.included)
    const metadata = [
        { label: 'Source', value: formatSegmentSource(segment.source) },
        { label: 'Priority', value: segment.priority },
        { label: 'Cacheability', value: segment.cacheability },
        { label: 'Compactability', value: segment.compactability },
        ...(inclusionLabel
            ? [{ label: 'Visibility', value: inclusionLabel }]
            : []),
        ...(segment.finalOrder != null
            ? [{ label: 'Final order', value: segment.finalOrder }]
            : []),
    ]

    return (
        <details
            open={isOpen}
            onToggle={(event) => {
                const nextOpen = event.currentTarget.open
                if (nextOpen !== isOpen) {
                    onOpenChange(nextOpen)
                }
            }}
            className='rounded-xl border border-white/6 bg-black/20 p-3'
        >
            <summary className='cursor-pointer list-none'>
                <div className='flex flex-wrap items-center gap-2 text-left'>
                    <span className='text-sm font-medium text-slate-100'>
                        {segment.id}
                    </span>
                    <span className='rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400'>
                        {segment.kind}
                    </span>
                    <span className='rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400'>
                        {formatSegmentSource(segment.source)}
                    </span>
                    {segment.estimatedTokens != null ? (
                        <span className='rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400'>
                            ~{segment.estimatedTokens} tk
                        </span>
                    ) : null}
                </div>
            </summary>
            <div className='mt-3 space-y-3'>
                <div className='grid gap-2 sm:grid-cols-2'>
                    {metadata.map((item) => (
                        <SegmentMetadata
                            key={`${segment.id}-${item.label}`}
                            label={item.label}
                            value={item.value}
                        />
                    ))}
                </div>
                <JsonBlock value={segment.payload} />
            </div>
        </details>
    )
}

export interface MessageContextDetailSheetProps {
    readonly state: MessageContextState
    readonly isOpen: boolean
    readonly messageId: string | null
    readonly onClose: () => void
    readonly onRetry?: () => void
}

export function MessageContextDetailSheet({
    state,
    isOpen,
    messageId,
    onClose,
    onRetry,
}: MessageContextDetailSheetProps) {
    const [isRawOpen, setIsRawOpen] = useState(false)
    const [segmentOpenState, setSegmentOpenState] = useState<
        Record<string, boolean>
    >({})
    const titleId = useId()
    const rawInspectId = useId()
    const isDesktop = useMatchesMediaQuery(DESKTOP_MEDIA_QUERY)
    const sheetRef = useRef<HTMLElement | null>(null)
    const closeButtonRef = useRef<HTMLButtonElement | null>(null)
    const previousFocusRef = useRef<HTMLElement | null>(null)

    const groups = state.status === 'ready' ? buildSegmentGroups(state.record) : []
    const segmentIdsSignature =
        state.status === 'ready'
            ? groups
                  .flatMap((group) =>
                      group.segments.map(
                          (segment) =>
                              `${group.key}:${segment.id}:${group.collapsedByDefault ? 'closed' : 'open'}`,
                      ),
                  )
                  .join('|')
            : ''

    useEffect(() => {
        setIsRawOpen(false)
    }, [messageId, isOpen])

    useEffect(() => {
        if (!isOpen || messageId == null || state.status !== 'ready') {
            setSegmentOpenState((prev) =>
                Object.keys(prev).length === 0 ? prev : {},
            )
            return
        }

        setSegmentOpenState((prev) => {
            const nextState = { ...prev }
            const nextSegmentIds = new Set<string>()
            let changed = false

            for (const group of groups) {
                for (const segment of group.segments) {
                    nextSegmentIds.add(segment.id)
                    if (nextState[segment.id] == null) {
                        nextState[segment.id] = !group.collapsedByDefault
                        changed = true
                    }
                }
            }

            for (const segmentId of Object.keys(nextState)) {
                if (!nextSegmentIds.has(segmentId)) {
                    delete nextState[segmentId]
                    changed = true
                }
            }

            return changed ? nextState : prev
        })
    }, [isOpen, messageId, segmentIdsSignature, state.status])

    useEffect(() => {
        if (!isOpen) {
            return
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    useEffect(() => {
        if (!isOpen || isDesktop) {
            return
        }

        previousFocusRef.current =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null

        const focusTarget = closeButtonRef.current ?? sheetRef.current
        focusTarget?.focus()

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Tab') {
                return
            }

            const sheet = sheetRef.current
            if (!sheet) {
                return
            }

            const focusableElements = Array.from(
                sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
            )
            const tabbableElements = focusableElements.filter(
                (element) =>
                    !element.hasAttribute('disabled') &&
                    element.getAttribute('aria-hidden') !== 'true',
            )

            if (tabbableElements.length === 0) {
                event.preventDefault()
                sheet.focus()
                return
            }

            const firstElement = tabbableElements[0]
            const lastElement = tabbableElements[tabbableElements.length - 1]
            const activeElement = document.activeElement

            if (event.shiftKey) {
                if (activeElement === firstElement || activeElement === sheet) {
                    event.preventDefault()
                    lastElement?.focus()
                }
                return
            }

            if (activeElement === lastElement) {
                event.preventDefault()
                firstElement?.focus()
            }
        }

        window.addEventListener('keydown', handleKeyDown)

        return () => {
            window.removeEventListener('keydown', handleKeyDown)

            const previousFocus = previousFocusRef.current
            if (previousFocus?.isConnected) {
                previousFocus.focus()
            }
            previousFocusRef.current = null
        }
    }, [isDesktop, isOpen])

    if (!isOpen || messageId == null) {
        return null
    }

    const isModal = !isDesktop

    return (
        <>
            {isModal ? (
                <button
                    type='button'
                    aria-label='Close context details overlay'
                    onClick={onClose}
                    className='fixed inset-0 z-30 bg-black/60 md:hidden'
                />
            ) : null}

            <aside
                ref={sheetRef}
                role={isModal ? 'dialog' : 'complementary'}
                aria-modal={isModal ? 'true' : undefined}
                aria-labelledby={titleId}
                tabIndex={-1}
                className='fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto border-t border-white/10 bg-[#050505] p-4 text-slate-200 shadow-[-1px_0_0_rgba(255,255,255,0.05)] md:static md:inset-auto md:w-[clamp(420px,36vw,480px)] md:border-l md:border-t-0'
            >
                <div className='sticky top-0 z-10 -mx-4 -mt-4 border-b border-white/8 bg-[#050505]/95 px-4 py-4 backdrop-blur'>
                    <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0'>
                            <p
                                id={titleId}
                                className='text-sm font-medium text-slate-50'
                            >
                                Context details
                            </p>
                            <p className='mt-1 break-all text-xs text-slate-500'>
                                Message {messageId}
                            </p>
                            <p className='mt-1 break-all text-xs text-slate-500'>
                                Run{' '}
                                {state.status === 'ready'
                                    ? state.record.runId
                                    : 'pending'}
                            </p>
                            {state.status === 'ready' ? (
                                <p className='mt-2 text-xs text-slate-400'>
                                    ~
                                    {
                                        state.record.manifest.assembledContext
                                            .totalEstimatedInputTokens
                                    }{' '}
                                    input ·{' '}
                                    {
                                        state.record.manifest.assembledContext
                                            .segments.length
                                    }{' '}
                                    segments ·{' '}
                                    {
                                        state.record.manifest.assembledContext
                                            .tools.length
                                    }{' '}
                                    tools
                                </p>
                            ) : null}
                        </div>
                        <button
                            ref={closeButtonRef}
                            type='button'
                            aria-label='Close context details'
                            onClick={onClose}
                            className='rounded-full border border-white/10 p-2 text-slate-400 transition-colors hover:text-white'
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {state.status === 'loading' ? (
                    <div className='mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-300'>
                        Loading context…
                    </div>
                ) : null}

                {state.status === 'error' ? (
                    <div className='mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-100'>
                        <p>{state.error}</p>
                        {onRetry ? (
                            <button
                                type='button'
                                onClick={onRetry}
                                className='mt-3 inline-flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-50 transition-colors hover:bg-rose-500/15'
                            >
                                <RefreshCcw size={12} />
                                Retry
                            </button>
                        ) : null}
                    </div>
                ) : null}

                {state.status === 'unavailable' ? (
                    <div className='mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-300'>
                        Context unavailable.
                    </div>
                ) : null}

                {state.status === 'ready' ? (
                    <div className='mt-4 space-y-4'>
                        <Section title='Overview'>
                            <div className='flex flex-wrap gap-2'>
                                {groups.map((group) => (
                                    <span
                                        key={group.key}
                                        className='rounded-full border border-white/10 px-2 py-1 text-xs text-slate-300'
                                    >
                                        {group.title}
                                    </span>
                                ))}
                            </div>
                        </Section>

                        <Section title='Segments'>
                            <div className='space-y-3'>
                                {groups.map((group) => (
                                    <div
                                        key={group.key}
                                        className='rounded-2xl border border-white/6 bg-black/20 p-3'
                                    >
                                        <h3 className='text-sm font-medium text-slate-100'>
                                            {group.title}
                                        </h3>
                                        <p className='mt-1 text-xs text-slate-500'>
                                            {group.segments.length} items · ~
                                            {group.estimatedTokens} tk
                                        </p>
                                        <div className='mt-3 space-y-2'>
                                            {group.segments.map((segment) => (
                                                <SegmentCard
                                                    key={segment.id}
                                                    segment={segment}
                                                    isOpen={
                                                        segmentOpenState[
                                                            segment.id
                                                        ] ?? !group.collapsedByDefault
                                                    }
                                                    onOpenChange={(nextOpen) =>
                                                        setSegmentOpenState(
                                                            (prev) => ({
                                                                ...prev,
                                                                [segment.id]:
                                                                    nextOpen,
                                                            }),
                                                        )
                                                    }
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Section>

                        <Section title='Tools'>
                            <div className='space-y-2'>
                                {state.record.manifest.assembledContext.tools
                                    .length > 0 ? (
                                    state.record.manifest.assembledContext.tools.map(
                                        (tool) => (
                                            <div
                                                key={`${tool.source}-${tool.name}`}
                                                className='rounded-xl border border-white/6 bg-black/20 p-3'
                                            >
                                                <p className='text-sm text-slate-100'>
                                                    {tool.name}
                                                </p>
                                                <p className='mt-1 text-xs text-slate-500'>
                                                    {tool.source} · ~
                                                    {tool.estimatedTokens ?? 0}{' '}
                                                    tk
                                                </p>
                                            </div>
                                        ),
                                    )
                                ) : (
                                    <p className='text-sm text-slate-500'>
                                        No assembled tools.
                                    </p>
                                )}
                            </div>
                        </Section>

                        <Section title='Request config'>
                            <div className='grid gap-3 md:grid-cols-2'>
                                <DiagnosticCard
                                    title='Model messages'
                                    value={{
                                        count: state.record.manifest
                                            .modelRequest.modelMessages.length,
                                        messages:
                                            state.record.manifest.modelRequest
                                                .modelMessages,
                                    }}
                                />
                                <DiagnosticCard
                                    title='Tool names'
                                    value={
                                        state.record.manifest.modelRequest
                                            .toolNames
                                    }
                                />
                                <DiagnosticCard
                                    title='Resolved params'
                                    value={
                                        state.record.manifest.modelRequest
                                            .resolvedParams
                                    }
                                />
                                <DiagnosticCard
                                    title='Provider options'
                                    value={
                                        state.record.manifest.modelRequest
                                            .providerOptions
                                    }
                                />
                                <DiagnosticCard
                                    title='Max output tokens'
                                    value={
                                        state.record.manifest.modelRequest
                                            .maxOutputTokens ?? 'Not set'
                                    }
                                />
                                <DiagnosticCard
                                    title='Tool request context'
                                    value={
                                        state.record.manifest.assembledContext
                                            .tools
                                    }
                                />
                            </div>
                        </Section>

                        <Section title='Raw inspect'>
                            <div className='flex items-center justify-between gap-3'>
                                <p className='text-xs text-slate-500'>
                                    Underlying payloads and request snapshots.
                                </p>
                                <button
                                    type='button'
                                    onClick={() =>
                                        setIsRawOpen((current) => !current)
                                    }
                                    className='inline-flex items-center gap-1 text-xs font-medium text-slate-300'
                                    aria-expanded={isRawOpen}
                                    aria-controls={rawInspectId}
                                    aria-label={
                                        isRawOpen
                                            ? 'Close raw inspect'
                                            : 'Open raw inspect'
                                    }
                                >
                                    {isRawOpen ? (
                                        <ChevronDown size={14} />
                                    ) : (
                                        <ChevronRight size={14} />
                                    )}
                                    {isRawOpen
                                        ? 'Hide raw inspect'
                                        : 'Open raw inspect'}
                                </button>
                            </div>
                            {isRawOpen ? (
                                <div
                                    id={rawInspectId}
                                    className='mt-3 space-y-3'
                                >
                                    <div>
                                        <p className='mb-2 text-xs uppercase tracking-[0.16em] text-slate-500'>
                                            System text
                                        </p>
                                        <JsonBlock
                                            value={
                                                state.record.manifest.modelRequest
                                                    .systemText
                                            }
                                        />
                                    </div>
                                    <div>
                                        <p className='mb-2 text-xs uppercase tracking-[0.16em] text-slate-500'>
                                            Input raw messages
                                        </p>
                                        <JsonBlock
                                            value={
                                                state.record.manifest.input
                                                    .rawMessages
                                            }
                                        />
                                    </div>
                                    <div>
                                        <p className='mb-2 text-xs uppercase tracking-[0.16em] text-slate-500'>
                                            Request model messages
                                        </p>
                                        <JsonBlock
                                            value={
                                                state.record.manifest
                                                    .modelRequest.modelMessages
                                            }
                                        />
                                    </div>
                                    <div>
                                        <p className='mb-2 text-xs uppercase tracking-[0.16em] text-slate-500'>
                                            Resolved params candidates
                                        </p>
                                        <JsonBlock
                                            value={
                                                state.record.manifest
                                                    .assembledContext.params
                                                    .candidates
                                            }
                                        />
                                    </div>
                                    <div>
                                        <p className='mb-2 text-xs uppercase tracking-[0.16em] text-slate-500'>
                                            Tool request context
                                        </p>
                                        <JsonBlock
                                            value={
                                                state.record.manifest
                                                    .assembledContext.tools
                                            }
                                        />
                                    </div>
                                    <div>
                                        <p className='mb-2 text-xs uppercase tracking-[0.16em] text-slate-500'>
                                            Plugin outputs
                                        </p>
                                        <JsonBlock
                                            value={
                                                state.record.manifest
                                                    .pluginOutputs
                                            }
                                        />
                                    </div>
                                    <div>
                                        <p className='mb-2 text-xs uppercase tracking-[0.16em] text-slate-500'>
                                            Result snapshot
                                        </p>
                                        <JsonBlock
                                            value={state.record.manifest.result}
                                        />
                                    </div>
                                </div>
                            ) : null}
                        </Section>
                    </div>
                ) : null}
            </aside>
        </>
    )
}
