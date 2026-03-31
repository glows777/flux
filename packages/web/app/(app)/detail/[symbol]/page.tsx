import { DetailView } from '@/components/detail/DetailView'

/**
 * Detail 详情页
 * 路径: /detail/[symbol]
 *
 * 数据获取由 DetailView 客户端组件管理
 */
interface DetailPageProps {
    params: Promise<{
        symbol: string
    }>
}

export default async function DetailPage({ params }: DetailPageProps) {
    const { symbol } = await params

    return (
        <div className='h-full overflow-y-auto lg:overflow-hidden p-6 md:p-10'>
            <DetailView symbol={symbol} />
        </div>
    )
}
