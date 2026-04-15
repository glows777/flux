'use client'

import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'

interface SWRProviderProps {
    children: ReactNode
}

/**
 * Global SWR configuration provider.
 * Disables revalidateOnFocus to prevent all hooks from refetching
 * when the user switches between browser windows / DevTools.
 */
export function SWRProvider({ children }: SWRProviderProps) {
    return (
        <SWRConfig value={{ revalidateOnFocus: false }}>{children}</SWRConfig>
    )
}
