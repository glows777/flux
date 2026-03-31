import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'

export default function AppLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <div className='flex h-screen relative z-10'>
            <Sidebar />
            <div className='flex flex-col flex-1'>
                <Header />
                <main className='flex-1 overflow-auto'>{children}</main>
            </div>
        </div>
    )
}
