export type SessionErrorCode = 'NOT_FOUND' | 'INVALID_INPUT'

export class SessionError extends Error {
    constructor(
        message: string,
        public readonly code: SessionErrorCode,
    ) {
        super(message)
        this.name = 'SessionError'
        Object.setPrototypeOf(this, SessionError.prototype)
    }
}
