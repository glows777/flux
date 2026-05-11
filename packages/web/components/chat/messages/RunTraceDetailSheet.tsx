'use client'

import { ChevronDown, ChevronRight, RefreshCcw, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type {
    RunTraceSegment,
    RunTraceState,
} from '@/lib/ai/run-trace-visibility'
import {
    buildTraceSegmentGroups,
    formatSegmentSource,
    formatSerializableContent,
} from '@/lib/ai/run-trace-visibility'

const DESKTOP_MEDIA_QUERY = '(min-width: 768px)'
const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    'summary',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ')

function getSegmentStateKey(messageId: string, segmentId: string) {
    return `${messageId}:${segmentId}`
}

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
            <p className='mt-1 break-words text-xs text-slate-200'>{value}</p>
        </div>
    )
}

function JsonBlock({
    value,
    emptyLabel = '-',
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
    readonly segment: RunTraceSegment
    readonly isOpen: boolean
    readonly onOpenChange: (nextOpen: boolean) => void
}) {
    const metadata = [
        { label: 'Source plugin', value: segment.sourcePlugin },
        ...(segment.origin ? [{ label: 'Origin', value: segment.origin }] : []),
        { label: 'Kind', value: segment.kind },
        { label: 'Cacheability', value: segment.cacheability },
        { label: 'Compactability', value: segment.compactability },
        { label: 'Content hash', value: segment.contentHash },
        ...(segment.target === 'messages'
            ? [
                  { label: 'Message count', value: segment.messageCount },
                  { label: 'Roles', value: segment.roles.join(', ') || '-' },
              ]
            : [{ label: 'Final order', value: segment.finalOrder }]),
        ...(segment.estimatedTokens != null
            ? [{ label: 'Estimated tokens', value: segment.estimatedTokens }]
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
                        {formatSegmentSource(segment)}
                    </span>
                    {segment.target === 'messages' ? (
                        <span className='rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400'>
                            {segment.messageCount} messages
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
                <JsonBlock value={segment} />
            </div>
        </details>
    )
}

export interface RunTraceDetailSheetProps {
    readonly state: RunTraceState
    readonly runId: string | null
    readonly messageId: string | null
    readonly isOpen: boolean
    readonly onClose: () => void
    readonly onRetry?: () => void
}

export function RunTraceDetailSheet({
    state,
    runId,
    messageId,
    isOpen,
    onClose,
    onRetry,
}: RunTraceDetailSheetProps) {
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

    const groups = useMemo(
        () =>
            state.status === 'ready'
                ? buildTraceSegmentGroups(state.record)
                : [],
        [state],
    )

    useEffect(() => {
        if (!isOpen || messageId != null) {
            setIsRawOpen(false)
        }
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
                    const segmentStateKey = getSegmentStateKey(
                        messageId,
                        segment.id,
                    )

                    nextSegmentIds.add(segmentStateKey)
                    if (nextState[segmentStateKey] == null) {
                        nextState[segmentStateKey] = !group.collapsedByDefault
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
    }, [groups, isOpen, messageId, state.status])

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
    const trace = state.status === 'ready' ? state.record.trace : null

    return (
        <>
            {isModal ? (
                <button
                    type='button'
                    aria-label='Close run trace overlay'
                    onClick={onClose}
                    className='fixed inset-0 z-30 bg-black/60 md:hidden'
                />
            ) : null}

            <aside
                ref={sheetRef}
                {...(isModal
                    ? { role: 'dialog', 'aria-modal': true }
                    : { role: 'complementary' })}
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
                                Run trace
                            </p>
                            <p className='mt-1 break-all text-xs text-slate-500'>
                                Message {messageId}
                            </p>
                            <p className='mt-1 break-all text-xs text-slate-500'>
                                Run {runId ?? trace?.runId ?? 'pending'}
                            </p>
                            {trace?.prompt ? (
                                <p className='mt-2 text-xs text-slate-400'>
                                    ~{trace.prompt.totalEstimatedInputTokens}{' '}
                                    input · {trace.prompt.segments.length}{' '}
                                    segments ·{' '}
                                    {trace.prompt.finalInput.tools.length} tools
                                </p>
                            ) : null}
                        </div>
                        <button
                            ref={closeButtonRef}
                            type='button'
                            aria-label='Close run trace'
                            onClick={onClose}
                            className='rounded-full border border-white/10 p-2 text-slate-400 transition-colors hover:text-white'
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {state.status === 'loading' ? (
                    <div className='mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-300'>
                        Loading trace...
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
                        Trace unavailable.
                    </div>
                ) : null}

                {state.status === 'ready' ? (
                    <div className='mt-4 space-y-4'>
                        <Section title='Overview'>
                            <div className='grid gap-2 sm:grid-cols-2'>
                                <SegmentMetadata
                                    label='Trace status'
                                    value={state.record.trace.traceStatus}
                                />
                                <SegmentMetadata
                                    label='Run outcome'
                                    value={state.record.trace.runOutcome}
                                />
                                <SegmentMetadata
                                    label='Current phase'
                                    value={state.record.trace.currentPhase}
                                />
                                <SegmentMetadata
                                    label='Completed phases'
                                    value={
                                        state.record.trace.completedPhases
                                            .length
                                    }
                                />
                            </div>
                        </Section>

                        <Section title='Segments'>
                            <div className='space-y-3'>
                                {groups.length > 0 ? (
                                    groups.map((group) => (
                                        <div
                                            key={group.key}
                                            className='rounded-2xl border border-white/6 bg-black/20 p-3'
                                        >
                                            <h3 className='text-sm font-medium text-slate-100'>
                                                {group.title}
                                            </h3>
                                            <p className='mt-1 text-xs text-slate-500'>
                                                {group.segments.length} items ·{' '}
                                                {group.messageCount} messages ·
                                                ~{group.estimatedTokens} tk
                                            </p>
                                            <div className='mt-3 space-y-2'>
                                                {group.segments.map(
                                                    (segment) => (
                                                        <SegmentCard
                                                            key={getSegmentStateKey(
                                                                messageId,
                                                                segment.id,
                                                            )}
                                                            segment={segment}
                                                            isOpen={
                                                                segmentOpenState[
                                                                    getSegmentStateKey(
                                                                        messageId,
                                                                        segment.id,
                                                                    )
                                                                ] ??
                                                                !group.collapsedByDefault
                                                            }
                                                            onOpenChange={(
                                                                nextOpen,
                                                            ) =>
                                                                setSegmentOpenState(
                                                                    (prev) => ({
                                                                        ...prev,
                                                                        [getSegmentStateKey(
                                                                            messageId,
                                                                            segment.id,
                                                                        )]:
                                                                            nextOpen,
                                                                    }),
                                                                )
                                                            }
                                                        />
                                                    ),
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className='text-sm text-slate-500'>
                                        No prompt segments recorded.
                                    </p>
                                )}
                            </div>
                        </Section>

                        <Section title='Request config'>
                            <div className='grid gap-3 md:grid-cols-2'>
                                <DiagnosticCard
                                    title='Model messages'
                                    value={{
                                        count:
                                            trace?.prompt?.finalInput
                                                .modelMessages.length ?? 0,
                                        messages:
                                            trace?.prompt?.finalInput
                                                .modelMessages ?? [],
                                    }}
                                />
                                <DiagnosticCard
                                    title='Tools'
                                    value={
                                        trace?.prompt?.finalInput.tools ?? []
                                    }
                                />
                                <DiagnosticCard
                                    title='Params'
                                    value={
                                        trace?.prompt?.finalInput.params ?? {}
                                    }
                                />
                                <DiagnosticCard
                                    title='System text'
                                    value={
                                        trace?.prompt?.finalInput.systemText ??
                                        ''
                                    }
                                />
                            </div>
                        </Section>

                        <Section title='Cache'>
                            <div className='grid gap-3 md:grid-cols-2'>
                                <DiagnosticCard
                                    title='Plan'
                                    value={trace?.cache?.plan}
                                />
                                <DiagnosticCard
                                    title='Provider request'
                                    value={trace?.cache?.providerRequest}
                                />
                                <DiagnosticCard
                                    title='Result'
                                    value={trace?.cache?.result}
                                />
                            </div>
                        </Section>

                        {trace?.result ? (
                            <Section title='Result'>
                                <JsonBlock value={trace.result} />
                            </Section>
                        ) : null}

                        {trace?.failure ? (
                            <Section title='Failure'>
                                <JsonBlock value={trace.failure} />
                            </Section>
                        ) : null}

                        <Section title='Raw inspect'>
                            <div className='flex items-center justify-between gap-3'>
                                <p className='text-xs text-slate-500'>
                                    Full run trace record.
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
                                <div id={rawInspectId} className='mt-3'>
                                    <JsonBlock value={trace} />
                                </div>
                            ) : null}
                        </Section>
                    </div>
                ) : null}
            </aside>
        </>
    )
}
