import { useEffect, useRef, useState, type Dispatch, type JSX, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { getCalibrationPresetKey, cn, type CalibrationPresetKey } from '../utils'

interface StandingsCalibration {
  colAStartX: number
  colAEndX: number
  colBStartX: number
  colBEndX: number
  startY: number
  endY: number
}

type CalibrationField = keyof StandingsCalibration

/** 固定3枠のプリセットキーと表示順 */
const PRESET_KEYS: CalibrationPresetKey[] = ['mk8dx', 'mkw12', 'mkw24']

const DEFAULT_CALIBRATION: StandingsCalibration = {
  colAStartX: 0,
  colAEndX: 24,
  colBStartX: 25,
  colBEndX: 50,
  startY: 0,
  endY: 100
}

interface Props {
  config: any
  setConfig: Dispatch<SetStateAction<any>>
}

/**
 * スタンドモード（standings24）用のデータ領域校正UI。
 * OBSキャプチャをプレビュー表示し、列A/列BのX範囲と2列共通のY範囲
 * （キャプチャ全幅/全高に対する%）を調整する。
 */
export function StandingsCalibrationPanel({ config, setConfig }: Props): JSX.Element {
  const { t } = useTranslation()
  const [preview, setPreview] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const mergeCalibration = (c: any): StandingsCalibration => ({
    ...DEFAULT_CALIBRATION,
    ...(c?.standingsCalibration ?? {})
  })

  // ---- 固定3枠プリセット（MK8DX / MKW12 / MKW24）----
  const activePresetKey = getCalibrationPresetKey(config?.analysisMode, config?.standardGame)
  const mergePresets = (c: any): Record<CalibrationPresetKey, StandingsCalibration | null> => ({
    mk8dx: null,
    mkw12: null,
    mkw24: null,
    ...(c?.standingsCalibrationPresets ?? {})
  })
  const presets = mergePresets(config)

  // 編集対象のプリセット。初期値は解析コンテキスト（モード×ゲーム）に連動し、
  // チップのクリックで別プリセットに切り替えて編集できる。
  // 操作タブでのモード/ゲーム変更時は自動的にそのコンテキストへ追従する
  const [editKey, setEditKey] = useState<CalibrationPresetKey>(() => activePresetKey)
  useEffect(() => {
    setEditKey(activePresetKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.analysisMode, config?.standardGame])

  // 表示する校正値: 編集中プリセットが保存済みならそれ、未保存なら従来の校正值を出発点にする
  const cal = presets[editKey] ?? mergeCalibration(config)

  // 12人用プリセット(MK8DX / MK World 12人)は2列に分かれないため、
  // 単一のX範囲(colAStartX〜colAEndX)を「名前〜点数」の領域として扱う
  const isSingleColumn = editKey !== 'mkw24'

  // 校正值の自動保存用デバウンスタイマーと送信予定ペイロード
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<Record<string, unknown> | null>(null)

  const schedulePersist = (payload: Record<string, unknown>) => {
    pendingSaveRef.current = payload
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const p = pendingSaveRef.current ?? {}
      pendingSaveRef.current = null
      window.electron?.ipcRenderer?.invoke('save-config', p).catch(() => {})
    }, 800)
  }

  /**
   * 校正値を1フィールド更新し、編集中のプリセット（editKey）へ保存して自動永続化する。
   * 編集中プリセットが現在の解析コンテキスト（activePresetKey）と一致する場合は
   * 従来の校正值（standingsCalibration）にも同じ値を書き込み、メインプロセスの
   * 解決順（resolveStandingsCalibration）と不整合が起きないようにする。
   * 別プリセット編集中は対象プリセットだけを更新し、他の値には触らない。
   */
  const update = (field: CalibrationField, v: number): void => {
    if (isNaN(v)) return
    const cur = cal
    const next: StandingsCalibration = {
      ...cur,
      [field]: Math.max(0, Math.min(100, v))
    }
    const nextPresets = { ...mergePresets(config), [editKey]: next }
    const isActiveContext = editKey === activePresetKey
    setConfig((prev: any) => ({
      ...prev,
      standingsCalibration: isActiveContext ? next : prev.standingsCalibration,
      standingsCalibrationPresets: nextPresets
    }))
    schedulePersist({
      ...(isActiveContext ? { standingsCalibration: next } : {}),
      standingsCalibrationPresets: nextPresets
    })
  }

  /** 入力完了後しばらく経っていない場合でも即時保存する（アンロード前等の保険） */
  const flushSave = (): void => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const p = pendingSaveRef.current ?? {}
    pendingSaveRef.current = null
    window.electron?.ipcRenderer?.invoke('save-config', p).catch(() => {})
  }
  void flushSave

  const capturePreview = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const result = await window.electron.ipcRenderer.invoke('obs-get-screenshot')
      if (result?.success) {
        setPreview(result.imageData || '')
      } else {
        setError(result?.error || 'Unknown error')
      }
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  // 縦範囲（2列共通）
  const bandTop = `${cal.startY}%`
  const bandHeight = `${Math.max(0, cal.endY - cal.startY)}%`

  return (
    <div className="border border-slate-700 rounded-xl p-4 space-y-3 bg-slate-900/50">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-200">{t('config.calTitle')}</span>
        <button
          type="button"
          onClick={capturePreview}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 transition-all disabled:opacity-50"
        >
          {loading ? t('config.calLoading') : t('config.calGetPreview')}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 break-all">{error}</p>}

      {/* 固定3枠プリセット: クリックで編集対象を切り替えるボタン。
          ハイライト中のプリセットが編集・自動保存の対象。●は保存済みを示す */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESET_KEYS.map((key) => {
          const isEditing = key === editKey
          const isActiveContext = key === activePresetKey
          const saved = presets[key]
          return (
            <button
              key={key}
              type="button"
              onClick={() => setEditKey(key)}
              title={
                isEditing
                  ? t('config.calPresetActive')
                  : t(isActiveContext ? 'config.calPresetActive' : saved ? 'config.calPresetSelectSaved' : 'config.calPresetSelectNew')
              }
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-bold border transition-all focus:outline-none cursor-pointer",
                isEditing
                  ? "border-accent-500 bg-accent-600 text-white shadow-lg shadow-accent-900/40"
                  : "border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              {t(`presets.${key}`)}
              {saved && (
                <span className={cn("ml-1", isEditing ? "text-emerald-300" : "text-emerald-400")} aria-hidden>
                  ●
                </span>
              )}
            </button>
          )
        })}
        {/* 現在の解析コンテキストのインジケーター */}
        <span className="text-[11px] text-slate-500 ml-1">
          ← {t('config.calContextBadge', { name: t(`presets.${activePresetKey}`) })}
        </span>
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">{t('config.calPresetsHint')}</p>
      {/* 編集中コンテキスト向けの選択範囲ガイド */}
      <p className="text-[11px] text-blue-300/90 leading-relaxed">
        {t(isSingleColumn ? 'config.calRegionHint12' : 'config.calRegionHint24')}
      </p>

      {preview && (
        <div className="relative w-full overflow-hidden rounded-xl border border-slate-700" style={{ aspectRatio: '16 / 9' }}>
          <img src={preview} alt="capture preview" className="absolute inset-0 h-full w-full object-contain bg-black" />
          {/* マスク: 選択領域（Y帯 × 列A/列B X範囲）の外側を暗くする */}
          {/* 上帯 / 下帯 */}
          <div className="absolute left-0 w-full bg-black/70" style={{ top: '0%', height: `${cal.startY}%` }} />
          <div className="absolute left-0 w-full bg-black/70" style={{ top: `${cal.endY}%`, height: `${Math.max(0, 100 - cal.endY)}%` }} />
          {/* Y帯内の横方向マスクと枠: 12人用は単一領域 / 24人用は2列 */}
          {isSingleColumn ? (
            <>
              <div className="absolute bg-black/70" style={{ top: bandTop, height: bandHeight, left: '0%', width: `${cal.colAStartX}%` }} />
              <div className="absolute bg-black/70" style={{ top: bandTop, height: bandHeight, left: `${cal.colAEndX}%`, width: `${Math.max(0, 100 - cal.colAEndX)}%` }} />
              <div className="absolute border-2 border-blue-400/80 pointer-events-none" style={{ top: bandTop, height: bandHeight, left: `${cal.colAStartX}%`, width: `${Math.max(0, cal.colAEndX - cal.colAStartX)}%` }} />
            </>
          ) : (
            <>
              <div className="absolute bg-black/70" style={{ top: bandTop, height: bandHeight, left: '0%', width: `${cal.colAStartX}%` }} />
              <div className="absolute bg-black/70" style={{ top: bandTop, height: bandHeight, left: `${cal.colAEndX}%`, width: `${Math.max(0, cal.colBStartX - cal.colAEndX)}%` }} />
              <div className="absolute bg-black/70" style={{ top: bandTop, height: bandHeight, left: `${cal.colBEndX}%`, width: `${Math.max(0, 100 - cal.colBEndX)}%` }} />
              <div className="absolute border-2 border-blue-400/80 pointer-events-none" style={{ top: bandTop, height: bandHeight, left: `${cal.colAStartX}%`, width: `${Math.max(0, cal.colAEndX - cal.colAStartX)}%` }} />
              <div className="absolute border-2 border-green-400/80 pointer-events-none" style={{ top: bandTop, height: bandHeight, left: `${cal.colBStartX}%`, width: `${Math.max(0, cal.colBEndX - cal.colBStartX)}%` }} />
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        <span className="block text-sm font-medium text-purple-300">{t('config.calYLabel')}</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label htmlFor="calStartY" className="block text-xs text-slate-400">{t('config.calStartY')}</label>
            <input
              id="calStartY"
              type="number"
              min={0}
              max={100}
              step={1}
              name="startY"
              value={cal.startY}
              onChange={(e) => update('startY', parseFloat(e.target.value))}
              className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="calEndY" className="block text-xs text-slate-400">{t('config.calEndY')}</label>
            <input
              id="calEndY"
              type="number"
              min={0}
              max={100}
              step={1}
              name="endY"
              value={cal.endY}
              onChange={(e) => update('endY', parseFloat(e.target.value))}
              className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
        </div>
      </div>

      <div className={cn("grid gap-4", isSingleColumn ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
        <div className="space-y-2">
          <span className="block text-sm font-medium text-blue-400">
            {t(isSingleColumn ? 'config.calSingleXLabel' : 'config.calColA')}
          </span>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor="calColAStartX" className="block text-xs text-slate-400">{t('config.calStartX')}</label>
              <input
                id="calColAStartX"
                type="number"
                min={0}
                max={100}
                step={1}
                name="colAStartX"
                value={cal.colAStartX}
                onChange={(e) => update('colAStartX', parseFloat(e.target.value))}
                className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="calColAEndX" className="block text-xs text-slate-400">{t('config.calEndX')}</label>
              <input
                id="calColAEndX"
                type="number"
                min={0}
                max={100}
                step={1}
                name="colAEndX"
                value={cal.colAEndX}
                onChange={(e) => update('colAEndX', parseFloat(e.target.value))}
                className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          </div>
        </div>
        {!isSingleColumn && (
        <div className="space-y-2">
          <span className="block text-sm font-medium text-green-400">{t('config.calColB')}</span>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor="calColBStartX" className="block text-xs text-slate-400">{t('config.calStartX')}</label>
              <input
                id="calColBStartX"
                type="number"
                min={0}
                max={100}
                step={1}
                name="colBStartX"
                value={cal.colBStartX}
                onChange={(e) => update('colBStartX', parseFloat(e.target.value))}
                className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="calColBEndX" className="block text-xs text-slate-400">{t('config.calEndX')}</label>
              <input
                id="calColBEndX"
                type="number"
                min={0}
                max={100}
                step={1}
                name="colBEndX"
                value={cal.colBEndX}
                onChange={(e) => update('colBEndX', parseFloat(e.target.value))}
                className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
              />
            </div>
          </div>
        </div>
        )}
      </div>

      <p className="text-xs text-slate-400">{t('config.calHint')}</p>
    </div>
  )
}
