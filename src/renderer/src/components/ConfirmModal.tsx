import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle } from 'lucide-react'

export function ConfirmModal({
    isOpen,
    onConfirm,
    onCancel,
    title,
    message,
    confirmText = "破棄して移動",
    cancelText = "キャンセル"
}: {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
}) {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onCancel}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-md bg-slate-900 border-2 border-red-500/50 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(239,68,68,0.2)]"
                    >
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-right from-red-600 to-transparent animate-pulse" />
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/30">
                                    <AlertCircle className="text-red-500" size={24} />
                                </div>
                                <h3 className="text-xl font-black text-slate-100 uppercase tracking-tight">{title}</h3>
                            </div>
                            <p className="text-slate-400 mb-8 leading-relaxed">
                                {message}
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={onCancel}
                                    className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all border border-slate-700 uppercase tracking-widest text-sm"
                                >
                                    {cancelText}
                                </button>
                                <button
                                    onClick={onConfirm}
                                    className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl transition-all shadow-lg shadow-red-600/20 uppercase tracking-widest text-sm"
                                >
                                    {confirmText}
                                </button>
                            </div>
                        </div>
                        <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-red-500/5 to-transparent pointer-events-none" />
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
