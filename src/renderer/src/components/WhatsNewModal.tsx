import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, ChevronRight } from 'lucide-react'

export function WhatsNewModal({
    isOpen,
    onClose,
    version,
    notes
}: {
    isOpen: boolean;
    onClose: () => void;
    version: string;
    notes: string;
}) {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 30 }}
                        className="relative w-full max-w-lg bg-slate-900 border-2 border-blue-500/50 rounded-3xl overflow-hidden shadow-[0_0_80px_rgba(59,130,246,0.3)]"
                    >
                        {/* 装飾 */}
                        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-shimmer" />
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl" />

                        <div className="p-8">
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-black bg-blue-500 text-white px-2 py-0.5 rounded uppercase tracking-widest">Update</span>
                                        <span className="text-blue-400 font-mono text-xs">v{version}</span>
                                    </div>
                                    <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 uppercase tracking-tight">What's New</h2>
                                </div>
                                <div className="w-14 h-14 bg-blue-600/20 rounded-2xl flex items-center justify-center border border-blue-500/30">
                                    <Zap className="text-blue-500 animate-pulse" size={32} />
                                </div>
                            </div>

                            <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 mb-8 max-h-[40vh] overflow-y-auto custom-scrollbar">
                                {notes ? (
                                    <div className="prose prose-invert prose-sm">
                                        <div
                                            className="text-slate-300 leading-relaxed font-medium"
                                            dangerouslySetInnerHTML={{ __html: notes }}
                                        />
                                    </div>
                                ) : (
                                    <p className="text-slate-500 italic text-center py-4">
                                        このバージョンの詳細なリリースノートはありません。
                                    </p>
                                )}
                            </div>

                            <button
                                onClick={onClose}
                                className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-black rounded-2xl transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] uppercase tracking-[0.2em] text-sm group flex items-center justify-center gap-2"
                            >
                                <span>Awesome!</span>
                                <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" />
                            </button>
                        </div>

                        <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-blue-500/10 to-transparent pointer-events-none" />
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
