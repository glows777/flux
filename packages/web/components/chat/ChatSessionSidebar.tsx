'use client'

import { PanelLeftClose, Plus } from 'lucide-react'
import { ChatSessionItem, type ChatSession } from './ChatSessionItem'

interface ChatSessionSidebarProps {
    readonly sessions: readonly ChatSession[]
    readonly currentSessionId: string | null
    readonly isLoadingList?: boolean
    readonly listError?: Error
    readonly onRetryList?: () => void
    readonly onNewSession: () => void
    readonly onSwitchSession: (id: string) => void
    readonly onDeleteSession: (id: string) => void
    readonly onRenameSession: (id: string, title: string) => void
    readonly collapsed: boolean
    readonly mounted: boolean
    readonly onToggleCollapse: () => void
}

export function ChatSessionSidebar({
    sessions,
    currentSessionId,
    isLoadingList,
    listError,
    onRetryList,
    onNewSession,
    onSwitchSession,
    onDeleteSession,
    onRenameSession,
    collapsed,
    mounted,
    onToggleCollapse,
}: ChatSessionSidebarProps) {
    return (
        <div
            inert={collapsed || undefined}
            className={`border-r border-white/5 flex flex-col shrink-0 overflow-hidden
                ${mounted ? 'transition-[width,opacity] duration-300 ease-out' : ''}
                ${collapsed ? 'w-0 opacity-0' : 'w-[260px] opacity-100'}`}
        >
            <div className='w-[260px] flex flex-col h-full'>
                <div className='p-4 flex items-center justify-between border-b border-white/5'>
                    <span className='text-sm font-medium text-slate-300'>会话列表</span>
                    <button
                        type='button'
                        onClick={onToggleCollapse}
                        className='p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors'
                        aria-label='折叠侧栏'
                    >
                        <PanelLeftClose size={14} />
                    </button>
                </div>

                <div className='p-3'>
                    <button
                        type='button'
                        onClick={onNewSession}
                        className='w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-xs text-slate-400 hover:text-emerald-400 hover:border-emerald-500/20 hover:bg-emerald-500/5 transition-all'
                    >
                        <Plus size={14} />
                        新建会话
                    </button>
                </div>

                <div className='flex-1 overflow-y-auto px-3 pb-3 space-y-1 scrollbar-thin scrollbar-thumb-white/10'>
                    {listError ? (
                        <div className='text-center py-8 space-y-2'>
                            <div className='text-xs text-red-400'>加载失败</div>
                            {onRetryList && (
                                <button type='button' onClick={onRetryList} className='text-xs text-slate-400 hover:text-emerald-400 transition-colors'>
                                    重试
                                </button>
                            )}
                        </div>
                    ) : isLoadingList ? (
                        <div className='space-y-2 py-2'>
                            {[1, 2, 3].map(i => <div key={i} className='h-10 bg-white/5 rounded-lg animate-pulse' />)}
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className='text-xs text-slate-600 text-center py-8'>暂无会话</div>
                    ) : (
                        sessions.map((session) => (
                            <ChatSessionItem
                                key={session.id}
                                session={session}
                                isActive={session.id === currentSessionId}
                                onSwitch={onSwitchSession}
                                onDelete={onDeleteSession}
                                onRename={onRenameSession}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
