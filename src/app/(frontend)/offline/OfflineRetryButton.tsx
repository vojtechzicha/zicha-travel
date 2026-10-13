'use client'

import { RefreshCw } from 'lucide-react'

/** Reload beats a homepage link here: it retries the page the visitor
 *  actually wanted, and the worker serves it fresh once the network is
 *  back. Label passed in so the page stays a server component. */
export function OfflineRetryButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[15px] font-semibold
                 bg-primary hover:bg-primary-dark text-white transition-colors"
    >
      <RefreshCw size={15} aria-hidden />
      {label}
    </button>
  )
}
