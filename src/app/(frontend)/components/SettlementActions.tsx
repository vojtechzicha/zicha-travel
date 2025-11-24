'use client'

import { useState } from 'react'
import { ArrowUp, ArrowDown, QrCode, Copy, Check } from 'lucide-react'
import { QRPayment } from './QRPayment'
import { formatCurrency } from '@/lib/formatCurrency'
import type { Participant, Chata } from '@/payload-types'

interface Creditor {
  name: string
  amount: number
}

interface Debtor {
  name: string
  amount: number
}

interface SettlementActionsProps {
  participant: Participant
  balance: number
  isBanker: boolean
  bankerAccount?: {
    number: string
    iban: string
  }
  chataShortName: string
  creditors: Creditor[]
  debtors: Debtor[]
  participants: Participant[]
}

function CopyableRow({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(copyValue ?? value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center justify-between gap-2 py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex-shrink-0 text-gray-500 text-sm">{label}</div>
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-sm font-medium text-gray-900 truncate" title={value}>{value}</span>
        <button
          onClick={handleCopy}
          className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          title="Kopírovat"
        >
          {copied ? (
            <Check size={16} className="text-green-500" />
          ) : (
            <Copy size={16} />
          )}
        </button>
      </div>
    </div>
  )
}

export function SettlementActions({
  participant,
  balance,
  isBanker,
  bankerAccount,
  chataShortName,
  creditors,
  debtors,
  participants,
}: SettlementActionsProps) {
  const [showQr, setShowQr] = useState<string | null>(null)

  // Use 1 Kč threshold to match backend - avoids showing small rounding differences
  const isDebtor = balance < -1
  const isCreditor = balance > 1

  // Banker view - show debtors and creditors
  if (isBanker) {
    // Filter out the banker from creditors (backend already filters out < 1 Kč)
    const activeDebtors = debtors
    const activeCreditors = creditors.filter((c) => c.name !== participant.name)

    return (
      <div className="grid md:grid-cols-2 gap-6">
          {/* Debtors - people who owe money */}
          <div>
            <h4 className="font-semibold text-lg text-gray-900 mb-3 flex items-center gap-2">
              <ArrowDown className="text-red-600" size={20} />
              Dluží ({activeDebtors.length})
            </h4>
            <div className="space-y-2">
              {activeDebtors.length > 0 ? (
                activeDebtors.map((debtor) => (
                  <div
                    key={debtor.name}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-white border-2 border-gray-200"
                  >
                    <span className="font-medium">{debtor.name}</span>
                    <span className="font-bold text-red-600">
                      {formatCurrency(debtor.amount)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">
                  Nikdo nedluží
                </p>
              )}
            </div>
          </div>

          {/* Creditors - people who are owed money */}
          <div>
            <h4 className="font-semibold text-lg text-gray-900 mb-3 flex items-center gap-2">
              <ArrowUp className="text-green-600" size={20} />
              Zaplatit ({activeCreditors.length})
            </h4>
            <div className="space-y-4">
              {activeCreditors.length > 0 ? (
                activeCreditors.map((creditor) => {
                  // Find participant to get IBAN
                  const creditorParticipant = participants.find(
                    (p) => p.name === creditor.name
                  )
                  const hasIban = creditorParticipant?.iban

                  // No bank account info - simple payment instruction
                  if (!hasIban) {
                    return (
                      <div
                        key={creditor.name}
                        className="bg-yellow-50 border-2 border-yellow-400 rounded-xl p-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="bg-yellow-400 p-2 rounded-lg">
                            <ArrowUp className="text-white" size={20} />
                          </div>
                          <div>
                            <p className="text-sm text-yellow-700">Zaplatit hotově</p>
                            <p className="font-semibold text-lg text-gray-900">
                              {creditor.name} – <span className="text-green-600">{formatCurrency(creditor.amount)}</span>
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-yellow-600">
                          Účastník nemá vyplněné bankovní údaje
                        </p>
                      </div>
                    )
                  }

                  // Has bank account - show QR + details table
                  const isExpanded = showQr === creditor.name
                  return (
                    <div
                      key={creditor.name}
                      className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden"
                    >
                      <button
                        onClick={() => setShowQr(isExpanded ? null : creditor.name)}
                        className="w-full p-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                      >
                        <span className="font-medium">{creditor.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-green-600">
                            {formatCurrency(creditor.amount)}
                          </span>
                          <QrCode size={16} className={`text-gray-400`} />
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-200 p-4 bg-green-50">
                          <div className="flex flex-col gap-4 items-center">
                            {/* QR Code */}
                            <div className="bg-white p-4 rounded-xl shadow-sm">
                              <QRPayment
                                amount={creditor.amount}
                                iban={creditorParticipant.iban!}
                                accountNumber={creditorParticipant.accountNumber ?? undefined}
                                message={`Vyrovnani - ${chataShortName}`}
                              />
                            </div>

                            {/* Payment details table */}
                            <div className="w-full">
                              <div className="bg-white rounded-xl p-4 shadow-sm">
                                <h5 className="text-sm font-medium text-gray-500 mb-3">Pro ruční zadání</h5>
                                <div>
                                  {creditorParticipant.accountNumber && (
                                    <CopyableRow label="Číslo účtu" value={creditorParticipant.accountNumber} />
                                  )}
                                  <CopyableRow label="IBAN" value={creditorParticipant.iban!} />
                                  <CopyableRow
                                    label="Částka"
                                    value={`${creditor.amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`}
                                    copyValue={creditor.amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, '')}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                <p className="text-gray-500 text-center py-4">
                  Nikomu nezaplatit
                </p>
              )}
            </div>
          </div>
        </div>
    )
  }

  // Regular participant view - only shown when not settled
  return (
    <div className="space-y-4">
      {isDebtor && bankerAccount && (
        <div className="bg-red-50 border-2 border-red-500 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="bg-red-500 p-2 rounded-lg">
              <ArrowDown className="text-white" size={24} />
            </div>
            <h4 className="font-semibold text-lg text-red-800">
              Zaplatit pokladníkovi
            </h4>
          </div>

          <div className="flex flex-col md:flex-row gap-5 items-center md:items-start">
            {/* QR Code - always visible */}
            <div className="flex-shrink-0">
              <div className="bg-white p-4 rounded-xl shadow-sm">
                <QRPayment
                  amount={Math.abs(balance)}
                  iban={bankerAccount.iban}
                  accountNumber={bankerAccount.number}
                  message={`Vyrovnani - ${chataShortName}`}
                />
              </div>
            </div>

            {/* Payment details table */}
            <div className="flex-1 w-full">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <h5 className="text-sm font-medium text-gray-500 mb-3">Pro ruční zadání</h5>
                <div>
                  <CopyableRow label="Číslo účtu" value={bankerAccount.number} />
                  <CopyableRow label="IBAN" value={bankerAccount.iban} />
                  <CopyableRow
                    label="Částka"
                    value={`${Math.abs(balance).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`}
                    copyValue={Math.abs(balance).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, '')}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCreditor && (
        <div className="bg-green-50 border-2 border-green-500 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <div className="bg-green-500 p-2 rounded-lg">
              <ArrowUp className="text-white" size={24} />
            </div>
            <div>
              <h4 className="font-semibold text-lg text-green-800 mb-1">
                Máte dostat od pokladníka
              </h4>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(balance)}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-600">
            Pokladník vám pošle peníze po vyrovnání všech dluhů.
          </p>
        </div>
      )}
    </div>
  )
}
