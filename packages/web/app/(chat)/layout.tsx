import { Sidebar } from '@/components/layout/Sidebar'

export default function ChatLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <div className='flex h-screen relative z-10'>
            <Sidebar />
            {children}
        </div>
    )
}
