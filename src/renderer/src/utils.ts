import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export const calculateRaceScore = (rank: number | undefined): number => {
    if (!rank) return 0
    const scores = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
    return scores[rank - 1] || 0
}
