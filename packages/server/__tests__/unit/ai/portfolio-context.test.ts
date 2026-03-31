import { describe, expect, it } from 'bun:test'
import { calculatePortfolioContext } from '@/core/ai/brief'
import type { PortfolioContext } from '@/core/ai/brief-types'

describe('calculatePortfolioContext', () => {
  it('returns zero-value object for empty holdings', () => {
    const result = calculatePortfolioContext([])

    expect(result).toEqual({
      positionWeights: [],
      topConcentration: 0,
      sectorExposure: [],
      totalHoldings: 0,
    } satisfies PortfolioContext)
  })

  it('returns 100% weight for single holding', () => {
    const result = calculatePortfolioContext([
      { symbol: 'AAPL', shares: 10, currentPrice: 150, sector: 'Technology' },
    ])

    expect(result.positionWeights).toEqual([{ symbol: 'AAPL', weight: 100 }])
    expect(result.topConcentration).toBe(100)
    expect(result.totalHoldings).toBe(1)
  })

  it('calculates correct weights for multiple holdings', () => {
    const result = calculatePortfolioContext([
      { symbol: 'AAPL', shares: 10, currentPrice: 100, sector: 'Technology' },  // 1000
      { symbol: 'GOOG', shares: 5, currentPrice: 200, sector: 'Technology' },   // 1000
      { symbol: 'JPM', shares: 20, currentPrice: 50, sector: 'Finance' },       // 1000
    ])
    // Total = 3000, each = 33.33%

    const totalWeight = result.positionWeights.reduce((sum, p) => sum + p.weight, 0)
    expect(Math.abs(totalWeight - 100)).toBeLessThan(0.1)
    expect(result.totalHoldings).toBe(3)
  })

  it('identifies topConcentration as the maximum weight', () => {
    const result = calculatePortfolioContext([
      { symbol: 'AAPL', shares: 70, currentPrice: 100, sector: 'Technology' },  // 7000
      { symbol: 'GOOG', shares: 20, currentPrice: 100, sector: 'Technology' },  // 2000
      { symbol: 'JPM', shares: 10, currentPrice: 100, sector: 'Finance' },      // 1000
    ])
    // Total = 10000 → AAPL = 70%

    expect(result.topConcentration).toBe(70)
  })

  it('aggregates sectorExposure for same-sector holdings', () => {
    const result = calculatePortfolioContext([
      { symbol: 'AAPL', shares: 10, currentPrice: 100, sector: 'Technology' },  // 1000
      { symbol: 'GOOG', shares: 10, currentPrice: 100, sector: 'Technology' },  // 1000
      { symbol: 'JPM', shares: 10, currentPrice: 100, sector: 'Finance' },      // 1000
    ])
    // Total = 3000 → Technology = 66.67%, Finance = 33.33%

    expect(result.sectorExposure).toEqual([
      { sector: 'Technology', weight: 66.67 },
      { sector: 'Finance', weight: 33.33 },
    ])
  })

  it('assigns "Unknown" sector when sector is undefined', () => {
    const result = calculatePortfolioContext([
      { symbol: 'AAPL', shares: 10, currentPrice: 100 },
    ])

    expect(result.sectorExposure).toEqual([
      { sector: 'Unknown', weight: 100 },
    ])
  })

  it('sorts sectorExposure by weight descending', () => {
    const result = calculatePortfolioContext([
      { symbol: 'JPM', shares: 10, currentPrice: 100, sector: 'Finance' },       // 1000
      { symbol: 'AAPL', shares: 30, currentPrice: 100, sector: 'Technology' },   // 3000
      { symbol: 'PFE', shares: 20, currentPrice: 100, sector: 'Healthcare' },    // 2000
    ])
    // Total = 6000 → Tech 50%, Healthcare 33.33%, Finance 16.67%

    expect(result.sectorExposure[0].sector).toBe('Technology')
    expect(result.sectorExposure[1].sector).toBe('Healthcare')
    expect(result.sectorExposure[2].sector).toBe('Finance')

    for (let i = 0; i < result.sectorExposure.length - 1; i++) {
      expect(result.sectorExposure[i].weight).toBeGreaterThanOrEqual(
        result.sectorExposure[i + 1].weight,
      )
    }
  })

  it('preserves 2 decimal places on weights', () => {
    const result = calculatePortfolioContext([
      { symbol: 'A', shares: 1, currentPrice: 100, sector: 'X' },   // 100
      { symbol: 'B', shares: 1, currentPrice: 200, sector: 'Y' },   // 200
      { symbol: 'C', shares: 1, currentPrice: 300, sector: 'Z' },   // 300
    ])
    // Total = 600 → A=16.67, B=33.33, C=50.00

    for (const pw of result.positionWeights) {
      const decimals = pw.weight.toString().split('.')[1]?.length ?? 0
      expect(decimals).toBeLessThanOrEqual(2)
    }

    for (const se of result.sectorExposure) {
      const decimals = se.weight.toString().split('.')[1]?.length ?? 0
      expect(decimals).toBeLessThanOrEqual(2)
    }
  })

  it('does not mutate the input array', () => {
    const holdings = [
      { symbol: 'AAPL', shares: 10, currentPrice: 150, sector: 'Technology' },
      { symbol: 'GOOG', shares: 5, currentPrice: 200, sector: 'Technology' },
    ]
    const snapshot = JSON.parse(JSON.stringify(holdings))

    calculatePortfolioContext(holdings)

    expect(holdings).toEqual(snapshot)
  })
})
