import React from 'react'
import { motion } from 'framer-motion'
import { RefreshCw } from 'lucide-react'

export function ScanningOverlay() {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="absolute inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl border-2 border-red-500/50 overflow-hidden"
        >
            <div className="absolute inset-0 scan-grid opacity-30" />
            <div className="scan-line" />

            <motion.div
                animate={{
                    boxShadow: ["0 0 15px rgba(239,68,68,0.3)", "0 0 30px rgba(239,68,68,0.6)", "0 0 15px rgba(239,68,68,0.3)"]
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className="relative z-10 w-24 h-24 border-2 border-red-500 rounded-full flex items-center justify-center bg-red-500/10"
            >
                <RefreshCw className="text-red-500 animate-spin" size={40} />
            </motion.div>

            <div className="mt-6 z-10 text-center">
                <h4 className="text-red-500 font-black tracking-[0.3em] uppercase text-xl">Analyzing</h4>
                <div className="flex gap-1 justify-center mt-2">
                    {[0, 1, 2].map(i => (
                        <motion.div
                            key={i}
                            animate={{ opacity: [0.2, 1, 0.2] }}
                            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                            className="w-2 h-2 bg-red-500 rounded-full"
                        />
                    ))}
                </div>
            </div>

            <div className="absolute bottom-4 left-6 right-6 flex justify-between text-[10px] text-red-500/50 font-mono">
                <span>X-AXIS: DETECTING</span>
                <span>Y-AXIS: SCANNING</span>
                <span>GROQ_VISION_ACTIVE</span>
            </div>
        </motion.div>
    )
}
