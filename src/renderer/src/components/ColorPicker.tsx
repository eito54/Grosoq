import React from 'react'

export function ColorPicker({ name, initialValue, onChange }: { name: string; initialValue: string; onChange?: () => void }) {
    const [localColor, setLocalColor] = React.useState(initialValue)

    React.useEffect(() => {
        setLocalColor(initialValue)
    }, [initialValue])

    return (
        <div className="relative group/color">
            <input
                type="color"
                name={name}
                value={localColor}
                onChange={(e) => {
                    setLocalColor(e.target.value)
                    if (onChange) onChange()
                }}
                className="w-full h-14 bg-slate-900 border-2 border-slate-700 rounded-xl cursor-pointer transition-all hover:border-blue-500 p-1"
            />
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                <span className="text-xs font-mono text-white/50 bg-black/40 px-2 py-1 rounded backdrop-blur-sm group-hover/color:text-white/80 transition-colors">
                    {localColor.toUpperCase()}
                </span>
            </div>
        </div>
    )
}
