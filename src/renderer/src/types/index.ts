export interface LogEntry {
    message: string
    timestamp: string
    type: 'info' | 'success' | 'error'
}

export interface SlotData {
    slotId: number
    name: string
    timestamp: string
    scores: any[]
    remainingRaces: number
}
