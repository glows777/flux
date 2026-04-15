import { describe, it } from 'bun:test'

describe('env check', () => {
    it('shows env state', () => {
        console.log('HTTPS_PROXY:', JSON.stringify(process.env.HTTPS_PROXY))
        console.log('HTTP_PROXY:', JSON.stringify(process.env.HTTP_PROXY))
        console.log('TAVILY_API_KEY:', process.env.TAVILY_API_KEY?.slice(0, 10))
        console.log('XMLHttpRequest:', typeof globalThis.XMLHttpRequest)
        console.log('Window:', typeof globalThis.Window)
    })
})
