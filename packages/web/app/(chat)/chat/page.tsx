import { Suspense } from 'react'
import { ChatPage } from '@/components/chat/ChatPage'

export default function ChatRoute() {
    return (
        <Suspense>
            <ChatPage />
        </Suspense>
    )
}
