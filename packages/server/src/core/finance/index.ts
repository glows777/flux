/**
 * Phase 3: Finance module barrel export
 *
 * Re-exports public APIs for the earnings analysis feature.
 */

// Types & schemas
export type {
    EarningsL1,
    EarningsL2,
    CachedEarningsL1,
    CachedEarningsL2,
    CachedFiscalQuarters,
    FiscalQuarter,
    UpcomingEarning,
    FmpErrorCode,
    FmpIncomeStatement,
    FmpEarningsSurprise,
    FmpCashFlow,
    FmpBalanceSheet,
    FmpTranscript,
    FmpProfile,
} from './types'
export {
    FmpError,
    FMP_ERROR_CODE_TO_STATUS,
    FmpIncomeStatementSchema,
    FmpEarningsSurpriseSchema,
    FmpCashFlowSchema,
    FmpBalanceSheetSchema,
    FmpTranscriptSchema,
    FmpProfileSchema,
} from './types'

// Quarter utilities
export {
    getQuarterFromDate,
    getQuarterKey,
    getCurrentQuarter,
    getAvailableQuarters,
    isEarningsCacheExpired,
} from './quarter-utils'

// FMP client
export {
    getIncomeStatements,
    getEarningsSurprises,
    getCashFlowStatement,
    getBalanceSheet,
    getTranscript,
    getProfile,
} from './fmp-client'
export type { FmpClientDeps } from './fmp-client'

// L1 service
export { getEarningsL1 } from './l1-service'
export type { L1ServiceDeps } from './l1-service'

// L2 prompt & service
export { buildL2AnalysisPrompt, summarizeL1, sanitizeTranscript } from './l2-prompt'
export { getEarningsL2, stripCodeFences } from './l2-service'
export type { L2ServiceDeps } from './l2-service'

// Cache layer
export { getL1WithCache, getL2WithCache, getQuartersWithCache, queryLatestEarningsL1FromCache, queryLatestEarningsL1BatchFromCache, queryUpcomingEarningsFromCache } from './cache'
export type { L1CacheDeps, L2CacheDeps, QuartersCacheDeps, BriefCacheQueryDeps, EarningsCacheRecord, UpsertCacheInput } from './cache'

// Fiscal quarters
export { getAvailableFiscalQuarters } from './fiscal-quarters'

// Transcript service
export { saveTranscript, getUploadedTranscript } from './transcript-service'
export type { TranscriptServiceDeps, SaveTranscriptResult } from './transcript-service'
