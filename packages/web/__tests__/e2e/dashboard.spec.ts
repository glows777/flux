import { expect, test } from '@playwright/test'

test.describe('Dashboard', () => {
    test('displays welcome message and stats', async ({ page }) => {
        await page.goto('/')

        // 验证欢迎语显示
        await expect(page.locator('text=早上好')).toBeVisible()

        // 验证统计卡片标签存在 (不断言具体数字，值来自实时 API)
        await expect(page.locator('text=总资产组合')).toBeVisible()
        await expect(page.locator('text=今日盈亏')).toBeVisible()
        await expect(page.locator('text=Flux 风险评分')).toBeVisible()

        // 验证"管理持仓"按钮存在
        await expect(page.locator('text=管理持仓')).toBeVisible()
    })

    test('navigates to detail page when clicking watchlist item', async ({
        page,
    }) => {
        await page.goto('/')

        // 点击自选股中的 NVDA
        await page.click('text=NVDA')

        // 验证跳转到详情页
        await expect(page).toHaveURL(/\/detail\/NVDA/)
    })
})
