import React, { useState, useEffect } from 'react'
import { animate } from 'framer-motion'
import { cn } from '../utils'

export function CountUp({ value, duration = 1 }: { value: number; duration?: number }) {
    const [displayValue, setDisplayValue] = useState(value)
    const [isCounting, setIsCounting] = useState(false)

    useEffect(() => {
        if (value !== displayValue) {
            setIsCounting(true)
            const controls = animate(displayValue, value, {
                duration,
                onUpdate: (latest) => setDisplayValue(Math.floor(latest)),
                onComplete: () => setIsCounting(false)
            })
            return () => controls.stop()
        }
        return undefined
    }, [value])

    return <span className={cn(isCounting && "counting-text transition-all")}>{displayValue}</span>
}
