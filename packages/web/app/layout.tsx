import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { SWRProvider } from '@/components/providers/SWRProvider'
import { ToastProvider } from '@/components/ui/Toast'
import './globals.css'

/**
 * 字体配置
 */
const inter = Inter({
    variable: '--font-inter',
    subsets: ['latin'],
    display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
    variable: '--font-jetbrains-mono',
    subsets: ['latin'],
    display: 'swap',
})

/**
 * Metadata
 */
export const metadata: Metadata = {
    title: 'Flux OS - AI-Powered Financial Intelligence Platform',
    description:
        'Flux OS 是一个由 AI 驱动的智能金融分析平台，提供实时市场洞察、资产追踪和智能决策支持。',
}

/**
 * Root Layout
 *
 * 包含全局氛围背景层和布局结构
 * Sidebar（T02）和 Header（T03）将在这里组装
 */
export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html lang='zh-CN'>
            <body
                className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
            >
                <SWRProvider>
                    {/* 全局氛围背景层 */}
                    <div className='flux-ambient-bg'>
                        <div className='flux-ambient-glow-1' />
                        <div className='flux-ambient-glow-2' />
                        <div className='flux-noise' />
                    </div>

                    {children}

                    <ToastProvider />
                </SWRProvider>
            </body>
        </html>
    )
}
