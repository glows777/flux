'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronRight, Check } from 'lucide-react'
import type { TimelineStep } from '@/lib/ai/tool-timeline'
import { buildTimelineSummary } from '@/lib/ai/tool-timeline'
import { ToolTimelineStep } from './ToolTimelineStep'

interface ToolTimelineProps {
  readonly steps: readonly TimelineStep[]
  readonly defaultCollapsed: boolean
}

export function ToolTimeline({ steps, defaultCollapsed }: ToolTimelineProps) {
  const [isOpen, setIsOpen] = useState(!defaultCollapsed)
  const userToggledRef = useRef(false)

  const allDone = steps.every(s => s.type === 'thinking' || s.state === 'done')

  // Auto-collapse when all steps complete (unless user manually toggled)
  useEffect(() => {
    if (userToggledRef.current) return
    if (allDone && steps.length > 0) {
      const timer = setTimeout(() => setIsOpen(false), 300)
      return () => clearTimeout(timer)
    }
  }, [allDone, steps.length])

  function handleToggle() {
    userToggledRef.current = true
    setIsOpen(prev => !prev)
  }

  const summary = buildTimelineSummary(steps)

  return (
    <div className='my-2'>
      {/* Summary bar */}
      <button
        type='button'
        data-testid='timeline-summary'
        onClick={handleToggle}
        className='flex items-center gap-2 text-sm text-slate-500 hover:text-slate-400 transition-colors cursor-pointer w-full text-left'
      >
        <span className='flex-1 truncate'>{summary}</span>
        {isOpen
          ? <ChevronDown size={14} className='shrink-0 text-slate-600' />
          : <ChevronRight size={14} className='shrink-0 text-slate-600' />
        }
      </button>

      {/* Timeline body */}
      {isOpen && (
        <div className='relative pl-8 mt-3 transition-all duration-200'>
          {/* Vertical line */}
          <div className='absolute left-[11px] top-2 bottom-2 w-px bg-white/10' />

          {/* Steps */}
          {steps.map((step) => (
            <ToolTimelineStep key={step.partIndex} step={step} />
          ))}

          {/* Done marker */}
          {allDone && steps.length > 0 && (
            <div className='relative'>
              <div className='absolute -left-8 top-0.5 w-6 h-6 flex items-center justify-center bg-[#0a0a0a] z-10'>
                <Check size={15} className='text-slate-500' />
              </div>
              <p className='text-[13px] text-slate-600 m-0'>Done</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
