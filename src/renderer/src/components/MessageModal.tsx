import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '../utils'

export function MessageModal({
    isOpen,
    onClose,
    type,
    title,
    message
}: {
    isOpen: boolean;
    onClose: () => void;
    type: 'info' | 'error' | 'success';
    title: string;
    message: string;
}) {
    const Icon = type === 'error' ? AlertCircle : (type === 'success' ? CheckCircle2 : Info);
    const colorClass = type === 'error' ? 'red' : (type === 'success' ? 'emerald' : 'blue');

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className={cn(
                            "relative w-full max-w-md bg-slate-900 border-2 rounded-2xl overflow-hidden shadow-2xl",
                            type === 'error' ? "border-red-500/50 shadow-red-900/20" :
                                type === 'success' ? "border-emerald-500/50 shadow-emerald-900/20" :
                                    "border-blue-500/50 shadow-blue-900/20"
                        )}
                    >
                        <div className={cn(
                            "absolute inset-x-0 top-0 h-1",
                            type === 'error' ? "bg-red-600" : type === 'success' ? "bg-emerald-600" : "bg-blue-600"
                        )} />
                        <div className="p-8">
                            <div className="flex items-center gap-4 mb-4">
                                <div className={cn(
                                    "w-12 h-12 rounded-2xl flex items-center justify-center border-2",
                                    type === 'error' ? "bg-red-500/10 border-red-500/30 text-red-500" :
                                        type === 'success' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" :
                                            "bg-blue-500/10 border-blue-500/30 text-blue-500"
                                )}>
                                    <Icon size={28} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-100 uppercase tracking-tight">{title}</h3>
                                    <div className={cn(
                                        "h-0.5 w-12 mt-1",
                                        type === 'error' ? "bg-red-500" : type === 'success' ? "bg-emerald-500" : "bg-blue-500"
                                    )} />
                                </div>
                            </div>
                            <p className="text-slate-300 mb-8 leading-relaxed whitespace-pre-wrap">
                                {message}
                            </p>
                            <button
                                onClick={onClose}
                                className={cn(
                                    "w-full py-4 font-black rounded-xl transition-all shadow-lg active:scale-95 text-white uppercase tracking-widest text-sm",
                                    type === 'error' ? "bg-red-600 hover:bg-red-500 shadow-red-900/40" :
                                        type === 'success' ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40" :
                                            "bg-blue-600 hover:bg-blue-500 shadow-blue-900/40"
                                )}
                            >
                                OK
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
