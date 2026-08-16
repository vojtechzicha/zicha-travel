'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { ArrowUp, ArrowDown, QrCode, Copy, Check } from 'lucide-react'
import { QRPayment } from './QRPayment'
import { formatCurrency } from '@/lib/formatCurrency'
import { track } from '@/lib/analytics'
import { resolveBankAccount } from '@/utils/czechBankAccount'
import type { AppLocale } from '@/i18n/config'
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
  /** creditor bank fields were withheld from this viewer (not admin/banker) */
  creditorAccountsHidden?: boolean
}

function CopyableRow({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  const t = useTranslations('finance')
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(copyValue ?? value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center justify-between gap-2 py-2.5 border-b border-gray-100 dark:border-white/[0.07] last:border-0">
      <div className="flex-shrink-0 text-gray-500 dark:text-slate-400 text-sm">{label}</div>
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={value}>{value}</span>
        <button
          onClick={handleCopy}
          className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
          title={t('settlement.copy')}
        >
          {copied ? (
            <Check size={16} className="text-green-500 dark:text-green-400" />
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
  creditorAccountsHidden = false,
}: SettlementActionsProps) {
  const t = useTranslations('finance')
  const locale = useLocale() as AppLocale
  const [showQr, setShowQr] = useState<string | null>(null)

  // Use 1 Kč threshold to match backend - avoids showing small rounding differences
  const isDebtor = balance < -1
  const isCreditor = balance > 1

  // someone is looking at "who do I pay / who owes me"
  useEffect(() => {
    if (isDebtor || isCreditor) {
      track('settlement_viewed', { side: isDebtor ? 'debtor' : 'creditor' })
    }
  }, [isDebtor, isCreditor])

  // Banker view - show debtors and creditors
  if (isBanker) {
    // Filter out the banker from creditors (backend already filters out < 1 Kč)
    const activeDebtors = debtors
    const activeCreditors = creditors.filter((c) => c.name !== participant.name)

    return (
      <div className="grid md:grid-cols-2 gap-6">
          {/* Debtors - people who owe money */}
          <div>
            <h4 className="font-semibold text-lg text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <ArrowDown className="text-red-600 dark:text-red-400" size={20} />
              {t('settlement.owes', { count: activeDebtors.length })}
            </h4>
            <div className="space-y-2">
              {activeDebtors.length > 0 ? (
                activeDebtors.map((debtor) => (
                  <div
                    key={debtor.name}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-white dark:bg-white/[0.03] border-2 border-gray-200 dark:border-white/[0.12]"
                  >
                    <span className="font-medium">{debtor.name}</span>
                    <span className="font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(debtor.amount, locale)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 dark:text-slate-400 text-center py-4">
                  {t('settlement.nobodyOwes')}
                </p>
              )}
            </div>
          </div>

          {/* Creditors - people who are owed money */}
          <div>
            <h4 className="font-semibold text-lg text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <ArrowUp className="text-green-600 dark:text-green-400" size={20} />
              {t('settlement.pay', { count: activeCreditors.length })}
            </h4>
            <div className="space-y-4">
              {activeCreditors.length > 0 ? (
                activeCreditors.map((creditor) => {
                  // Find participant to get banking info; derive the missing
                  // half (account ↔ IBAN) — participants often fill only one.
                  // The QR generator needs the Czech account number format
                  const creditorParticipant = participants.find(
                    (p) => p.name === creditor.name
                  )
                  const creditorBank = resolveBankAccount(
                    creditorParticipant?.accountNumber,
                    creditorParticipant?.iban
                  )

                  // Creditor accounts are served only to the banker's own
                  // account and chata admins — an anonymous banker view gets
                  // a sign-in hint instead of a misleading "pay cash" box
                  if (!creditorBank?.accountNumber && creditorAccountsHidden) {
                    return (
                      <div
                        key={creditor.name}
                        className="bg-blue-50 dark:bg-sky-400/10 border-2 border-blue-300 dark:border-sky-400/40 rounded-xl p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {creditor.name}
                          </span>
                          <span className="font-bold text-green-600 dark:text-green-400">
                            {formatCurrency(creditor.amount, locale)}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-blue-700 dark:text-sky-300">
                          {t('settlement.accountsBehindLogin')}{' '}
                          <a href="/login" className="underline underline-offset-2 font-medium">
                            {t('settlement.accountsBehindLoginCta')}
                          </a>
                        </p>
                      </div>
                    )
                  }

                  // No (usable) bank account info - simple payment instruction
                  if (!creditorBank?.accountNumber) {
                    return (
                      <div
                        key={creditor.name}
                        className="bg-yellow-50 dark:bg-amber-400/10 border-2 border-yellow-400 dark:border-amber-400/40 rounded-xl p-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="bg-yellow-400 p-2 rounded-lg">
                            <ArrowUp className="text-white" size={20} />
                          </div>
                          <div>
                            <p className="text-sm text-yellow-700 dark:text-amber-300">{t('settlement.payCash')}</p>
                            <p className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                              {creditor.name} – <span className="text-green-600 dark:text-green-400">{formatCurrency(creditor.amount, locale)}</span>
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-yellow-600 dark:text-amber-300/90">
                          {t('settlement.noBankDetails')}
                        </p>
                      </div>
                    )
                  }

                  // Has bank account - show QR + details table
                  const isExpanded = showQr === creditor.name
                  return (
                    <div
                      key={creditor.name}
                      className="bg-white dark:bg-white/[0.03] border-2 border-gray-200 dark:border-white/[0.12] rounded-xl overflow-hidden"
                    >
                      <button
                        onClick={() => setShowQr(isExpanded ? null : creditor.name)}
                        className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-white/[0.06] transition-colors"
                      >
                        <span className="font-medium">{creditor.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-green-600 dark:text-green-400">
                            {formatCurrency(creditor.amount, locale)}
                          </span>
                          <QrCode size={16} className={`text-gray-400 dark:text-slate-500`} />
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-200 dark:border-white/[0.12] p-4 bg-green-50 dark:bg-emerald-500/10">
                          <div className="flex flex-col gap-4 items-center">
                            {/* QR Code */}
                            <div className="bg-white p-4 rounded-xl shadow-sm">
                              <QRPayment
                                amount={creditor.amount}
                                accountNumber={creditorBank.accountNumber}
                                message={t('settlement.qrMessage', { name: chataShortName })}
                              />
                            </div>

                            {/* Payment details table */}
                            <div className="w-full">
                              <div className="bg-white dark:bg-white/[0.04] rounded-xl p-4 shadow-sm">
                                <h5 className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-3">{t('settlement.manualEntry')}</h5>
                                <div>
                                  <CopyableRow label={t('settlement.accountNumber')} value={creditorBank.accountNumber} />
                                  {creditorBank.iban && (
                                    <CopyableRow label={t('settlement.iban')} value={creditorBank.iban} />
                                  )}
                                  <CopyableRow
                                    label={t('settlement.amount')}
                                    value={formatCurrency(Math.round(creditor.amount), locale)}
                                    copyValue={Math.round(creditor.amount).toString()}
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
                <p className="text-gray-500 dark:text-slate-400 text-center py-4">
                  {t('settlement.nobodyToPay')}
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
      {isDebtor && bankerAccount?.number && (
        <div className="bg-red-50 dark:bg-red-500/10 border-2 border-red-500 dark:border-red-500/50 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="bg-red-500 p-2 rounded-lg">
              <ArrowDown className="text-white" size={24} />
            </div>
            <h4 className="font-semibold text-lg text-red-800 dark:text-red-300">
              {t('settlement.payBanker')}
            </h4>
          </div>

          <div className="flex flex-wrap gap-5 items-start justify-center">
            {/* QR Code - always visible */}
            <div className="flex-shrink-0">
              <div className="bg-white p-4 rounded-xl shadow-sm">
                <QRPayment
                  amount={Math.abs(balance)}
                  accountNumber={bankerAccount.number}
                  message={t('settlement.qrMessage', { name: chataShortName })}
                />
              </div>
            </div>

            {/* Payment details table — wraps below the QR when too narrow to show the IBAN */}
            <div className="flex-1 basis-[21rem] min-w-0">
              <div className="bg-white dark:bg-white/[0.04] rounded-xl p-4 shadow-sm">
                <h5 className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-3">{t('settlement.manualEntry')}</h5>
                <div>
                  <CopyableRow label={t('settlement.accountNumber')} value={bankerAccount.number} />
                  {bankerAccount.iban && <CopyableRow label={t('settlement.iban')} value={bankerAccount.iban} />}
                  <CopyableRow
                    label={t('settlement.amount')}
                    value={formatCurrency(Math.round(Math.abs(balance)), locale)}
                    copyValue={Math.round(Math.abs(balance)).toString()}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCreditor && (
        <div className="bg-green-50 dark:bg-emerald-500/10 border-2 border-green-500 dark:border-emerald-500/50 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <div className="bg-green-500 p-2 rounded-lg">
              <ArrowUp className="text-white" size={24} />
            </div>
            <div>
              <h4 className="font-semibold text-lg text-green-800 dark:text-emerald-300 mb-1">
                {t('settlement.receiveFromBanker')}
              </h4>
              <p className="text-3xl font-bold text-green-600 dark:text-emerald-300">
                {formatCurrency(balance, locale)}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-600 dark:text-slate-300">
            {t('settlement.bankerWillSend')}
          </p>
        </div>
      )}
    </div>
  )
}
