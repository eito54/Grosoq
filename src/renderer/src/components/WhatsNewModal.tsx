import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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
    const { t } = useTranslation()
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
                        className="relative w-full max-w-xl bg-slate-900 border-2 border-accent-500/50 rounded-2xl overflow-hidden shadow-[0_0_80px_rgba(239,68,68,0.3)]"
                    >
                        {/* 装飾 */}
                        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-accent-500 to-transparent animate-shimmer" />
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-accent-500/10 rounded-full blur-3xl" />

                        <div className="p-7 sm:p-8">
                            <div className="flex items-center justify-between gap-4 mb-6">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-black bg-blue-500 text-white px-2 py-0.5 rounded uppercase tracking-widest">Update</span>
                                        <span className="text-blue-400 font-mono text-xs">v{version}</span>
                                    </div>
                                    <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300 uppercase tracking-tight">What's New</h2>
                                </div>
                                <div className="flex-shrink-0 w-14 h-14 bg-accent-600/20 rounded-2xl flex items-center justify-center border border-accent-500/30">
                                    <Zap className="text-blue-500 animate-pulse" size={32} />
                                </div>
                            </div>

                            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl px-5 sm:px-6 py-5 mb-6 max-h-[48vh] overflow-y-auto custom-scrollbar">
                                {notes ? (
                                    <div className="release-notes text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                                        {notes}
                                    </div>
                                ) : (
                                    <p className="text-slate-400 text-center py-6">
                                        {t('whatsNew.noNotes')}
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
