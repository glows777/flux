/**
 * Phase 3 Step 3: L2 AI Analysis Prompt Builder
 *
 * Builds the prompt for Gemini to generate EarningsL2 from:
 * - L1 hard data summary
 * - Earnings call transcript
 *
 * Output: strict JSON matching EarningsL2 interface.
 */

import type { EarningsL1 } from './types'

const MAX_TRANSCRIPT_CHARS = 60_000 // ~15k tokens

/**
 * Summarize L1 data into a compact text block for the AI prompt.
 */
export function summarizeL1(l1: EarningsL1): string {
    const lines: string[] = [
        `公司: ${l1.name} (${l1.symbol})`,
        `季度: ${l1.period}`,
        `财报日期: ${l1.reportDate}`,
        '',
        '## 关键财务数据',
        `营收: ${formatB(l1.keyFinancials.revenue)}`,
        l1.keyFinancials.revenueYoY !== null
            ? `营收同比: ${l1.keyFinancials.revenueYoY.toFixed(2)}%`
            : '营收同比: 数据暂缺',
        `营业利润: ${formatB(l1.keyFinancials.operatingIncome)}`,
        l1.keyFinancials.fcf !== null
            ? `自由现金流: ${formatB(l1.keyFinancials.fcf)}`
            : '自由现金流: 数据暂缺',
        l1.keyFinancials.debtToAssets !== null
            ? `负债率: ${l1.keyFinancials.debtToAssets.toFixed(2)}%`
            : '负债率: 数据暂缺',
    ]

    // Beat/Miss
    if (l1.beatMiss.eps) {
        lines.push('')
        lines.push('## EPS Beat/Miss')
        lines.push(`实际 EPS: $${l1.beatMiss.eps.actual}`)
        lines.push(`预期 EPS: $${l1.beatMiss.eps.expected}`)
        const diff = l1.beatMiss.eps.actual - l1.beatMiss.eps.expected
        lines.push(diff >= 0 ? `Beat $${diff.toFixed(2)}` : `Miss $${Math.abs(diff).toFixed(2)}`)
    }

    // Margins
    if (l1.margins.length > 0) {
        lines.push('')
        lines.push('## 利润率趋势')
        for (const m of l1.margins) {
            const parts = [m.quarter]
            if (m.gross !== null) parts.push(`毛利率 ${m.gross.toFixed(2)}%`)
            if (m.operating !== null) parts.push(`营业利润率 ${m.operating.toFixed(2)}%`)
            if (m.net !== null) parts.push(`净利率 ${m.net.toFixed(2)}%`)
            lines.push(parts.join(' | '))
        }
    }

    return lines.join('\n')
}

/**
 * Format number as billions with 2 decimal places.
 * Handles negative values (e.g. operating losses).
 */
function formatB(value: number): string {
    const billions = value / 1e9
    return billions < 0
        ? `-$${Math.abs(billions).toFixed(2)}B`
        : `$${billions.toFixed(2)}B`
}

/**
 * Sanitize transcript to prevent prompt injection and limit length.
 * - Truncates at MAX_TRANSCRIPT_CHARS
 * - Replaces triple backticks that could break prompt structure
 */
export function sanitizeTranscript(raw: string): string {
    const truncated = raw.length > MAX_TRANSCRIPT_CHARS
        ? `${raw.slice(0, MAX_TRANSCRIPT_CHARS)}\n\n[Transcript truncated...]`
        : raw
    return truncated.replace(/```/g, "'''")
}

/**
 * Build the full L2 analysis prompt for Gemini.
 *
 * @param l1 - L1 hard data
 * @param transcript - Raw earnings call transcript text
 * @returns Complete prompt string
 */
export function buildL2AnalysisPrompt(l1: EarningsL1, transcript: string): string {
    const l1Summary = summarizeL1(l1)
    const safeTranscript = sanitizeTranscript(transcript)

    return `你是一位华尔街资深分析师，擅长解读财报电话会议（Earnings Call）。

请基于以下 L1 财务数据和 Earnings Call Transcript，生成一份结构化的 AI 分析报告。

---

## L1 财务数据摘要

${l1Summary}

---

## Earnings Call Transcript

${safeTranscript}

---

## 输出要求

请严格按照以下 JSON 格式输出，不要输出任何其他内容：

\`\`\`json
{
  "symbol": "${l1.symbol}",
  "period": "${l1.period}",
  "tldr": "3-5 句话的中文摘要，概括本季度财报核心要点",
  "guidance": {
    "nextQuarterRevenue": "管理层对下季度营收的展望（中文描述）",
    "fullYearAdjustment": "上调 | 维持 | 下调 | 未提及",
    "keyQuote": "从 transcript 中引用最关键的英文原话",
    "signal": "正面 | 中性 | 谨慎"
  },
  "segments": [
    {
      "name": "业务板块名称",
      "value": "营收金额",
      "yoy": "同比变化",
      "comment": "中文简评"
    }
  ],
  "managementSignals": {
    "tone": "乐观 | 中性 | 谨慎",
    "keyPhrases": ["从 transcript 提取的英文关键词/短语"],
    "quotes": [
      {
        "en": "英文原话引用",
        "cn": "对应中文翻译"
      }
    ],
    "analystFocus": ["分析师关注的焦点问题（中文）"]
  },
  "suggestedQuestions": ["用户可能想进一步追问的问题（中文）"]
}
\`\`\`

## 规则

1. **中文分析**: tldr、comment、analystFocus、suggestedQuestions 等分析内容使用中文
2. **引用原话**: keyQuote、quotes.en、keyPhrases 必须从 transcript 中直接引用英文原文，不编造、不虚构
3. **基于数据**: 所有分析必须基于提供的 L1 数据和 transcript，不捏造任何数字或事实
4. **枚举值严格匹配**:
   - fullYearAdjustment: 只能是 "上调" | "维持" | "下调" | "未提及"
   - signal: 只能是 "正面" | "中性" | "谨慎"
   - tone: 只能是 "乐观" | "中性" | "谨慎"
5. **segments**: 至少列出 2 个主要业务板块（如果 transcript 提到的话）
6. **suggestedQuestions**: 2-4 个深入问题
7. **只输出 JSON**: 不要输出 markdown 代码块以外的任何文字`
}
