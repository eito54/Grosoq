import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../utils'

interface SourceSelectProps {
  id?: string
  /** 設定画面のフォーム保存(FormData)用に input へ付与するname */
  name?: string
  /** 制御コンポーネントとして使う場合の値（ウィザード等） */
  value?: string
  /** 非制御で使う場合の初期値（設定フォーム等） */
  defaultValue?: string
  onChange?: (value: string) => void
  /** OBSから取得したソース一覧。空でも選択肢パネルは開く */
  sources: { inputName: string; inputKind?: string }[]
  placeholder?: string
}

/**
 * OBSソース名を選ぶ角丸カスタムドロップダウン。
 * - 入力欄はフリーテキスト入力可（手動入力とリスト選択の両対応）
 * - パネルには「設定値の有無に関わらず」常に全ソースを表示する
 * - framer-motion で滑らかに開閉する
 */
export function SourceSelect({
  id,
  name,
  value,
  defaultValue,
  onChange,
  sources,
  placeholder
}: SourceSelectProps) {
  // 制御 or 非制御の両方に対応
  const isControlled = value !== undefined && onChange !== undefined
  const [innerValue, setInnerValue] = useState(defaultValue ?? '')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  const current = isControlled ? value : innerValue

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  // 開いたときはハイライトを現在値（なければ先頭）に合わせる
  useEffect(() => {
    if (!open) return
    const idx = sources.findIndex(s => s.inputName === current)
    setHighlighted(idx >= 0 ? idx : 0)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const setValue = (v: string) => {
    if (isControlled) onChange(v)
    else setInnerValue(v)
  }

  return (
    <div ref={rootRef} className="relative">
      {/* トリガー: フリーテキスト入力 + 角丸トグルボタン */}
      <div className="relative flex">
        <input
          id={id}
          name={name}
          type="text"
          value={current}
          onChange={(e) => { setValue(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
              setHighlighted(h => Math.min(h + 1, Math.max(sources.length - 1, 0)))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlighted(h => Math.max(h - 1, 0))
            } else if (e.key === 'Enter' && open) {
              e.preventDefault()
              if (sources[highlighted]) { setValue(sources[highlighted].inputName); setOpen(false) }
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
          placeholder={placeholder}
          className={cn(
            "w-full bg-surface border border-slate-700 rounded-l-xl pl-4 pr-2 py-3 text-white",
            "focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all font-sans"
          )}
        />
        <button
          type="button"
          aria-label="Toggle source list"
          onClick={() => setOpen(o => !o)}
          className={cn(
            "flex items-center justify-center px-3 bg-surface border border-l-0 border-slate-700 rounded-r-xl text-slate-400 hover:text-white transition-colors cursor-pointer",
            "focus:outline-none focus:ring-2 focus:ring-accent-500/50"
          )}
        >
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18 }}>
            <ChevronDown size={16} />
          </motion.span>
        </button>
      </div>

      {/* 候補パネル: 現在の入力値に関係なく常に全ソースを表示 */}
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 480, damping: 34 }}
            style={{ transformOrigin: 'top center' }}
            role="listbox"
            className={cn(
              "absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-56 overflow-y-auto custom-scrollbar",
              "bg-slate-800 border border-slate-700 rounded-xl p-1.5 space-y-1 shadow-2xl shadow-black/50"
            )}
          >
            {sources.length > 0 ? (
              sources.map((s, i) => {
                const isSelected = s.inputName === current
                return (
                  <li key={`${s.inputName}-${i}`} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlighted(i)}
                      onClick={() => { setValue(s.inputName); setOpen(false) }}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors cursor-pointer",
                        highlighted === i ? "bg-slate-700/80 text-white" : "text-slate-300"
                      )}
                    >
                      <span className="truncate">{s.inputName}</span>
                      <span className="flex items-center gap-2 shrink-0 text-xs text-slate-500">
                        {s.inputKind && s.inputKind.replace('_', ' ')}
                        {isSelected && <Check size={14} className="text-accent-400" />}
                      </span>
                    </button>
                  </li>
                )
              })
            ) : (
              <li className="px-3 py-2 text-sm text-slate-500">—</li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
