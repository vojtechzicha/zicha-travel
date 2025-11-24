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

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
        {/* Color preview button */}
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '8px',
            backgroundColor: currentColor,
            border: '2px solid var(--theme-elevation-150)',
            cursor: 'pointer',
            transition: 'transform 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          title="Click to open color picker"
        />

        {/* Hex input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--theme-elevation-500)', fontFamily: 'monospace' }}>#</span>
          <HexColorInput
            color={currentColor}
            onChange={handleColorChange}
            prefixed={false}
            style={{
              width: '80px',
              padding: '8px 12px',
              fontSize: '14px',
              fontFamily: 'monospace',
              border: '1px solid var(--theme-elevation-150)',
              borderRadius: '4px',
              backgroundColor: 'var(--theme-input-bg)',
              color: 'var(--theme-text)',
            }}
          />
        </div>
      </div>

      {/* Color picker popover */}
      {showPicker && (
        <div
          style={{
            position: 'relative',
            marginTop: '12px',
          }}
        >
          <div
            style={{
              position: 'absolute',
              zIndex: 1000,
              backgroundColor: 'var(--theme-elevation-50)',
              padding: '16px',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
              border: '1px solid var(--theme-elevation-150)',
            }}
          >
            <HexColorPicker color={currentColor} onChange={handleColorChange} />

            {/* Preset colors */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 1fr)',
                gap: '6px',
                marginTop: '12px',
              }}
            >
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
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '4px',
                    backgroundColor: presetColor,
                    border:
                      currentColor === presetColor
                        ? '2px solid var(--theme-text)'
                        : '1px solid var(--theme-elevation-200)',
                    cursor: 'pointer',
                    transition: 'transform 0.1s ease',
                  }}
                  title={presetColor}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowPicker(false)}
              style={{
                width: '100%',
                marginTop: '12px',
                padding: '8px',
                backgroundColor: 'var(--theme-elevation-100)',
                border: '1px solid var(--theme-elevation-200)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
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
