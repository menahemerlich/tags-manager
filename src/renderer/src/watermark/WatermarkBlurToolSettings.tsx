import type { Dispatch, InputHTMLAttributes, SetStateAction } from 'react'

/** סליידרים לכלי טשטוש — מופרד לשימוש חוזר. */
export function WatermarkBlurToolSettings({
  blurStrength,
  setBlurStrength,
  blurFeather,
  setBlurFeather,
  focusSeparation,
  setFocusSeparation,
  blurSliderInteractionProps
}: {
  blurStrength: number
  setBlurStrength: Dispatch<SetStateAction<number>>
  blurFeather: number
  setBlurFeather: Dispatch<SetStateAction<number>>
  focusSeparation: number
  setFocusSeparation: Dispatch<SetStateAction<number>>
  blurSliderInteractionProps: InputHTMLAttributes<HTMLInputElement>
}) {
  return (
    <div className="watermark-tools-settings watermark-blur-tool-settings">
      <div className="field watermark-tool-field">
        <label>עוצמת טשטוש: {blurStrength}</label>
        <input
          type="range"
          min={0}
          max={40}
          step={1}
          value={blurStrength}
          onChange={(e) => setBlurStrength(Number(e.target.value))}
          {...blurSliderInteractionProps}
        />
      </div>
      <div className="field watermark-tool-field">
        <label>ריכוך: {blurFeather}</label>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={blurFeather}
          onChange={(e) => setBlurFeather(Number(e.target.value))}
          {...blurSliderInteractionProps}
        />
      </div>
      <div className="field watermark-tool-field">
        <label>ניגודיות בין בחירה לרקע: {focusSeparation}%</label>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={focusSeparation}
          onChange={(e) => setFocusSeparation(Number(e.target.value))}
          {...blurSliderInteractionProps}
        />
      </div>
    </div>
  )
}
