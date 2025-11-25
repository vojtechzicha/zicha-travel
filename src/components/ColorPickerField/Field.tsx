'use client'

import { HexColorPicker, HexColorInput } from 'react-colorful'
import { useField } from '@payloadcms/ui'
import { useState, useCallback } from 'react'

interface ColorPickerFieldProps {
  path: string
  label?: string
  required?: boolean
}

export function ColorPickerField({ path, label, required }: ColorPickerFieldProps) {
  const { value, setValue } = useField<string>({ path })
  const [showPicker, setShowPicker] = useState(false)

  const handleColorChange = useCallback(
    (color: string) => {
      setValue(color)
    },
    [setValue],
  )

  const currentColor = value || '#d97706'

  return (
    <div className="field-type text">
      {label && (
        <label className="field-label">
          {label}
          {required && <span className="required">*</span>}
        </label>
      )}

      <div className="flex items-center gap-3 mt-2">
        {/* Color preview button */}
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className="w-12 h-12 rounded-lg cursor-pointer transition-transform hover:scale-105"
          style={{
            backgroundColor: currentColor,
            border: '2px solid var(--theme-elevation-150)',
          }}
          title="Click to open color picker"
        />

        {/* Hex input */}
        <div className="flex items-center gap-1">
          <span className="font-mono" style={{ color: 'var(--theme-elevation-500)' }}>
            #
          </span>
          <HexColorInput
            color={currentColor}
            onChange={handleColorChange}
            prefixed={false}
            className="w-20 px-3 py-2 text-sm font-mono rounded"
            style={{
              border: '1px solid var(--theme-elevation-150)',
              backgroundColor: 'var(--theme-input-bg)',
              color: 'var(--theme-text)',
            }}
          />
        </div>
      </div>

      {/* Color picker popover */}
      {showPicker && (
        <div className="relative mt-3">
          <div
            className="absolute z-[1000] p-4 rounded-lg shadow-lg"
            style={{
              backgroundColor: 'var(--theme-elevation-50)',
              border: '1px solid var(--theme-elevation-150)',
            }}
          >
            <HexColorPicker color={currentColor} onChange={handleColorChange} />

            {/* Preset colors */}
            <div className="grid grid-cols-8 gap-1.5 mt-3">
              {[
                '#d97706', // orange (default)
                '#2563eb', // blue
                '#16a34a', // green
                '#9333ea', // purple
                '#dc2626', // red
                '#0d9488', // teal
                '#db2777', // pink
                '#f59e0b', // amber
              ].map((presetColor) => (
                <button
                  key={presetColor}
                  type="button"
                  onClick={() => handleColorChange(presetColor)}
                  className="w-6 h-6 rounded cursor-pointer transition-transform hover:scale-110"
                  style={{
                    backgroundColor: presetColor,
                    border:
                      currentColor === presetColor
                        ? '2px solid var(--theme-text)'
                        : '1px solid var(--theme-elevation-200)',
                  }}
                  title={presetColor}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="w-full mt-3 py-2 rounded cursor-pointer text-sm"
              style={{
                backgroundColor: 'var(--theme-elevation-100)',
                border: '1px solid var(--theme-elevation-200)',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
