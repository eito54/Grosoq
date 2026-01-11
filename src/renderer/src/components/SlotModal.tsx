import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../utils'

export function SlotModal({
    isOpen,
    onClose,
    onConfirm,
    type,
    name,
    setName,
    slotId
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    type: 'load' | 'add' | 'delete';
    name: string;
    setName: (name: string) => void;
    slotId: number | null;
}) {
    const getActionInfo = () => {
        switch (type) {
            case 'load':
                return {
                    title: 'スロットをロード',
                    message: 'このスロットのスコアを読み込みます。現在のスコアは失われます。',
                    confirmText: 'ロードする',
                    confirmClass: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                }
            case 'add':
                return {
                    title: 'スコアを加算',
                    message: 'このスロットのスコアを現在のスコアに足します。',
                    confirmText: '加算する',
                    confirmClass: 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/20'
                }
            case 'delete':
                return {
                    title: 'スロットを削除',
                    message: 'このスロットを完全に削除します。この操作は取り消せません。',
                    confirmText: '削除する',
                    confirmClass: 'bg-red-600 hover:bg-red-500 shadow-red-600/20'
                }
        }
    }

    const info = getActionInfo()

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-md bg-slate-900 border-2 border-slate-800 rounded-3xl overflow-hidden shadow-2xl"
                    >
                        <div className="p-8">
                            <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">{info.title}</h3>
                            <p className="text-slate-400 mb-6 text-sm">{info.message}</p>


                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={onClose}
                                    className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all border border-slate-700 uppercase tracking-widest text-xs"
                                >
                                    キャンセル
                                </button>
                                <button
                                    onClick={onConfirm}
                                    className={cn(
                                        "flex-1 px-4 py-3 text-white font-black rounded-xl transition-all shadow-lg uppercase tracking-widest text-xs",
                                        info.confirmClass
                                    )}
                                >
                                    {info.confirmText}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
