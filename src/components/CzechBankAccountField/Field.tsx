'use client'

import { useField } from '@payloadcms/ui'
import { useCallback, useMemo } from 'react'
import type { TextFieldClientComponent } from 'payload'
import { accountToIban, ibanToAccount } from '@/utils/czechBankAccount'

function getSiblingPath(path: string): string {
  if (path === 'bankerAccountNumber') return 'bankerIban'
  if (path === 'bankerIban') return 'bankerAccountNumber'
  if (path === 'accountNumber') return 'iban'
  if (path === 'iban') return 'accountNumber'
  return ''
}

function getDirection(path: string): 'toIban' | 'toAccount' {
  if (path.toLowerCase().includes('iban')) return 'toAccount'
  return 'toIban'
}

export const CzechBankAccountField: TextFieldClientComponent = ({ field, path, readOnly }) => {
  const { value, setValue, showError, errorMessage } = useField<string>({ path })

  const siblingPath =
    (field.admin?.custom?.siblingPath as string) || getSiblingPath(path)
  const direction =
    (field.admin?.custom?.direction as 'toIban' | 'toAccount') || getDirection(path)

  const { setValue: setSiblingValue } = useField<string>({
    path: siblingPath || '_noop',
  })

  const converted = useMemo(() => {
    if (!value) return null
    return direction === 'toIban' ? accountToIban(value) : ibanToAccount(value)
  }, [value, direction])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value)
    },
    [setValue],
  )

  const handleConvert = useCallback(() => {
    if (converted && siblingPath) {
      setSiblingValue(converted)
    }
  }, [converted, siblingPath, setSiblingValue])

  const label = typeof field.label === 'string' ? field.label : field.name

  return (
    <div className="field-type text" style={{ marginBottom: 'var(--spacing-field)' }}>
      {label && (
        <label className="field-label" htmlFor={`field-${path}`}>
          {label}
          {field.required && <span className="required"> *</span>}
        </label>
      )}

      <div>
        <input
          type="text"
          id={`field-${path}`}
          name={path}
          value={(value as string) || ''}
          onChange={handleChange}
          readOnly={readOnly}
          style={{
            width: '100%',
            padding: '10px',
            border: showError
              ? '1px solid var(--theme-error-500)'
              : '1px solid var(--theme-elevation-150)',
            borderRadius: 'var(--style-radius-s, 4px)',
            backgroundColor: 'var(--theme-input-bg)',
            color: 'var(--theme-text)',
            fontSize: '1rem',
            lineHeight: '1.25',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {converted && siblingPath && (
        <button
          type="button"
          onClick={handleConvert}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '6px',
            padding: '4px 10px',
            fontSize: '0.8rem',
            backgroundColor: 'var(--theme-elevation-100)',
            border: '1px solid var(--theme-elevation-200)',
            borderRadius: '4px',
            cursor: 'pointer',
            color: 'var(--theme-text)',
            lineHeight: '1.5',
          }}
        >
          {direction === 'toIban'
            ? `Fill IBAN \u2192 ${converted}`
            : `Fill account number \u2192 ${converted}`}
        </button>
      )}

      {field.admin?.description && (
        <div
          style={{
            marginTop: '6px',
            fontSize: '0.85rem',
            color: 'var(--theme-elevation-400)',
          }}
        >
          {field.admin.description as string}
        </div>
      )}

      {showError && errorMessage && (
        <div
          style={{
            color: 'var(--theme-error-500)',
            marginTop: '4px',
            fontSize: '0.85rem',
          }}
        >
          {errorMessage}
        </div>
      )}
    </div>
  )
}
