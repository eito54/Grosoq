import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Trash2 } from 'lucide-react'
import { cn } from '../utils'
import { CountUp } from './CountUp'

export function ScoreItem({
    team,
    index,
    isEditing,
    onRemove,
    onChange,
    onSetCurrentPlayer
}: {
    team: any;
    index: number;
    isEditing: boolean;
    onRemove: (i: number) => void;
    onChange: (i: number, field: string, value: any) => void;
    onSetCurrentPlayer?: () => void;
}) {
    const [isFlashing, setIsFlashing] = useState(false)
    const [prevScore, setPrevScore] = useState(team.score)
    const [showAdded, setShowAdded] = useState(false)
    const isCurrentPlayer = team.isCurrentPlayer

    useEffect(() => {
        if (team.score > prevScore) {
            setIsFlashing(true)
            setShowAdded(true)
            const flashTimer = setTimeout(() => setIsFlashing(false), 1200)
            const addedTimer = setTimeout(() => setShowAdded(false), 3000)
            setPrevScore(team.score)
            return () => {
                clearTimeout(flashTimer)
                clearTimeout(addedTimer)
            }
        }
        setPrevScore(team.score)
        return undefined
    }, [team.score])

    return (
        <motion.tr
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={cn(
                "group border-b-0 rounded-none mb-1 transition-all relative overflow-hidden",
                // Rank specific backgrounds
                index === 0 && "bg-gradient-to-r from-yellow-500/10 via-yellow-500/5 to-transparent",
                index === 1 && "bg-gradient-to-r from-slate-300/10 via-slate-300/5 to-transparent",
                index === 2 && "bg-gradient-to-r from-amber-700/10 via-amber-700/5 to-transparent",
                index > 2 && "glass-card hover:bg-slate-800/50",

                // Active flash and specific borders
                isFlashing && "animate-score-flash",
                isCurrentPlayer && "bg-blue-600/10"
            )}
        >
            <td className="px-6 py-4 font-medium text-slate-200 relative">
                {/* Current Player Indicator Bar (Inside first cell) */}
                {isCurrentPlayer && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                )}

                <div className="flex items-center gap-4">
                    {/* Rank Badge */}
                    <div className="relative flex-shrink-0">
                        <div className={cn(
                            "w-10 h-10 flex items-center justify-center font-black italic rounded-lg transform skew-x-[-10deg] shadow-lg border-t border-white/10 relative z-10",
                            index === 0 ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-white shadow-yellow-900/40" :
                                index === 1 ? "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800 shadow-slate-900/40" :
                                    index === 2 ? "bg-gradient-to-br from-amber-600 to-amber-800 text-amber-100 shadow-amber-900/40" :
                                        "bg-slate-800/50 text-slate-500 border border-slate-700"
                        )}>
                            <div className="transform skew-x-[10deg]">
                                {index === 0 ? <Trophy size={18} className="drop-shadow-md" /> : <span className="text-lg">{index + 1}</span>}
                            </div>
                        </div>

                        {/* Rank Glow Effect for Top 3 */}
                        {index < 3 && (
                            <div className={cn(
                                "absolute inset-0 blur-lg opacity-40 rounded-lg",
                                index === 0 ? "bg-yellow-500" :
                                    index === 1 ? "bg-slate-300" : "bg-amber-600"
                            )} />
                        )}
                    </div>

                    {isEditing ? (
                        <input
                            type="text"
                            value={team.name || team.team || ''}
                            onChange={(e) => onChange(index, 'name', e.target.value)}
                            className="bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold"
                        />
                    ) : (
                        <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className={cn(
                                    "font-bold text-lg tracking-wide truncate",
                                    index === 0 ? "text-yellow-100" :
                                        index === 1 ? "text-white" :
                                            index === 2 ? "text-amber-100" :
                                                isCurrentPlayer ? "text-blue-100" : "text-slate-300"
                                )}>
                                    {team.name || team.team}
                                </span>
                                {isCurrentPlayer && (
                                    <span className="flex-shrink-0 text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-bold shadow-lg shadow-blue-500/30">YOU</span>
                                )}
                            </div>
                            {!isCurrentPlayer && !isEditing && (
                                <button
                                    onClick={onSetCurrentPlayer}
                                    className="text-[10px] text-slate-500 hover:text-blue-400 transition-colors w-fit flex items-center gap-1 -ml-1 px-1 py-0.5 rounded hover:bg-white/5 opacity-0 group-hover:opacity-100"
                                >
                                    <span>自分に設定</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </td>

            <td className="px-6 py-4 text-right relative w-48">
                <div className="flex items-center justify-end gap-3">
                    {isEditing ? (
                        <input
                            type="number"
                            value={team.score}
                            onChange={(e) => onChange(index, 'score', e.target.value)}
                            className="bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 w-24 text-right focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono font-bold"
                        />
                    ) : (
                        <div className="flex flex-col items-end w-full">
                            <div className={cn(
                                "text-3xl font-black font-mono tracking-tight",
                                index === 0 ? "text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.3)]" :
                                    index === 1 ? "text-slate-200 drop-shadow-[0_0_10px_rgba(226,232,240,0.3)]" :
                                        index === 2 ? "text-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.3)]" :
                                            "text-blue-400"
                            )}>
                                <CountUp value={team.score} />
                            </div>
                            <div className="h-1 w-full max-w-[120px] bg-slate-800 rounded-full overflow-hidden mt-1 opacity-50">
                                <motion.div
                                    className={cn(
                                        "h-full rounded-full",
                                        index === 0 ? "bg-yellow-500" :
                                            index === 1 ? "bg-slate-300" :
                                                index === 2 ? "bg-amber-600" : "bg-blue-500"
                                    )}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min((team.score / 150) * 100, 100)}%` }} // 150 as arbitrary max for bar, logic can be improved
                                    transition={{ duration: 1, ease: "easeOut" }}
                                />
                            </div>
                        </div>
                    )}

                    <AnimatePresence>
                        {showAdded && team.addedScore > 0 && (
                            <motion.span
                                initial={{ opacity: 0, y: 10, scale: 0.8 }}
                                animate={{ opacity: 1, y: -20, scale: 1.2 }}
                                exit={{ opacity: 0, scale: 0 }}
                                className="absolute right-0 -top-4 text-emerald-400 font-black text-lg pointer-events-none drop-shadow-[0_0_8px_rgba(52,211,153,0.8)] z-20"
                            >
                                +{team.addedScore}
                            </motion.span>
                        )}
                    </AnimatePresence>
                </div>
            </td>

            {isEditing && (
                <td className="px-6 py-4 text-right w-10">
                    <button
                        onClick={() => onRemove(index)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-slate-500 hover:text-red-500 transition-all"
                    >
                        <Trash2 size={16} />
                    </button>
                </td>
            )}
        </motion.tr>
    )
}
