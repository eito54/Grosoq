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

/** 校正プリセットのキー。3枠は固定（MK8DX / MK World 12人 / MK World 24人） */
export type CalibrationPresetKey = 'mk8dx' | 'mkw12' | 'mkw24'

/**
 * 現在の解析コンテキストに対応する校正プリセットキーを返す。
 * - standings24モード → 常に MK World 24人
 * - standard12モード → 操作タブで選択した対象ゲーム(MK8DX / MK World)に応じて分岐
 */
export function getCalibrationPresetKey(
    analysisMode?: string,
    standardGame?: string
): CalibrationPresetKey {
    if (analysisMode === 'standings24') return 'mkw24'
    return standardGame === 'mkworld' ? 'mkw12' : 'mk8dx'
}
