import type { MacroTicker, NewsItem, WatchlistItem } from '@flux/shared'

/**
 * 宏观指标
 */
export const MACRO_TICKERS: MacroTicker[] = [
    { sym: '标普500', val: '498.20', chg: '+1.2%', trend: 'up' },
    { sym: '比特币', val: '64,230', chg: '+3.5%', trend: 'up' },
    { sym: '十年美债', val: '4.10%', chg: '-0.02%', trend: 'down' },
    { sym: '恐慌指数', val: '13.40', chg: '-5.1%', trend: 'down' },
]

/**
 * 自选股列表
 */
export const WATCHLIST: WatchlistItem[] = [
    {
        id: 'NVDA',
        name: '英伟达',
        price: 780.42,
        chg: 2.4,
        signal: '强力看涨',
        score: 92,
        data: Array.from({ length: 20 }, (_, i) => 50 + i + Math.random() * 10),
    },
    {
        id: 'TSLA',
        name: '特斯拉',
        price: 175.3,
        chg: -1.2,
        signal: '观望中性',
        score: 45,
        data: Array.from(
            { length: 20 },
            (_, i) => 60 - i * 0.5 + Math.random() * 5,
        ),
    },
    {
        id: 'AMD',
        name: '超威半导体',
        price: 180.15,
        chg: 1.8,
        signal: '看涨',
        score: 85,
        data: Array.from(
            { length: 20 },
            (_, i) => 30 + i * 0.8 + Math.random() * 5,
        ),
    },
    {
        id: 'COIN',
        name: 'Coinbase',
        price: 240.5,
        chg: 5.4,
        signal: '高波动',
        score: 78,
        data: Array.from(
            { length: 20 },
            (_, i) => 20 + i * 1.5 + Math.random() * 15,
        ),
    },
    {
        id: 'PLTR',
        name: 'Palantir',
        price: 24.1,
        chg: 0.5,
        signal: '机构吸筹',
        score: 65,
        data: Array.from({ length: 20 }, (_, i) => 40 + Math.sin(i) * 10),
    },
]

/**
 * 新闻数据
 */
export const NEWS_FEED: NewsItem[] = [
    {
        id: 1,
        source: '彭博社',
        time: '1小时前',
        title: '英伟达 CEO 表示 AI 芯片需求"刚刚开始"。',
        sentiment: 'positive',
    },
    {
        id: 2,
        source: '路透社',
        time: '3小时前',
        title: '半导体板块因财报超预期强劲反弹。',
        sentiment: 'positive',
    },
    {
        id: 3,
        source: 'Seeking Alpha',
        time: '5小时前',
        title: '为什么现在的估值可能仍然便宜？',
        sentiment: 'neutral',
    },
    {
        id: 4,
        source: '华尔街日报',
        time: '6小时前',
        title: '科技巨头云资本支出激增，利好芯片股。',
        sentiment: 'positive',
    },
]
