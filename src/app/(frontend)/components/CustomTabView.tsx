'use client'

// "Vlastní záložky": one admin-authored rich-text page per tab
// (src/lib/customTabs.ts). Payload's Lexical renderer turns the JSON into
// React elements, so nothing here sets HTML. Links and images get our own
// converters: links pass safeLinkHref and open off-site targets in a new
// tab, images render lazily and open the shared PhotoLightbox.

import { useMemo, useState } from 'react'
import {
  RichText,
  type JSXConverter,
  type JSXConvertersFunction,
} from '@payloadcms/richtext-lexical/react'
import type {
  SerializedEditorState,
  SerializedLexicalNode,
} from '@payloadcms/richtext-lexical/lexical'
import {
  BookOpen,
  Calendar,
  FileText,
  Info,
  Map,
  Mountain,
  Sparkles,
  Utensils,
  type LucideIcon,
} from 'lucide-react'
import type { Media } from '@/payload-types'
import { safeLinkHref, type CustomTabIcon } from '@/lib/customTabs'
import { Sheet } from './SheetUi'
import { PhotoLightbox, type LightboxPhoto } from './PhotoLightbox'

const ICONS: Record<CustomTabIcon, LucideIcon> = {
  'file-text': FileText,
  mountain: Mountain,
  map: Map,
  utensils: Utensils,
  sparkles: Sparkles,
  'book-open': BookOpen,
  calendar: Calendar,
  info: Info,
}

export function customTabIcon(icon: string | null | undefined): LucideIcon {
  return ICONS[icon as CustomTabIcon] ?? FileText
}

interface LexicalNode {
  type?: string
  value?: unknown
  children?: LexicalNode[]
}

/** The parts of Lexical's link/autolink node the converter reads. */
interface LinkNode extends SerializedLexicalNode {
  children: SerializedLexicalNode[]
  fields?: { url?: string | null; newTab?: boolean | null }
}

const isImage = (value: unknown): value is Media =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Media).url === 'string' &&
  typeof (value as Media).mimeType === 'string' &&
  (value as Media).mimeType!.startsWith('image/')

/** Every populated image in document order: the lightbox pages through them. */
function collectImages(content: unknown): Media[] {
  const images: Media[] = []
  const visit = (node: LexicalNode) => {
    if (node.type === 'upload' && isImage(node.value)) images.push(node.value)
    node.children?.forEach(visit)
  }
  const root = (content as { root?: LexicalNode } | null)?.root
  if (root) visit(root)
  return images
}

const isExternal = (href: string) => /^https?:\/\//i.test(href)

interface CustomTabViewProps {
  title: string
  icon?: string | null
  content: unknown
}

export function CustomTabView({ title, icon, content }: CustomTabViewProps) {
  const Icon = customTabIcon(icon)
  const images = useMemo(() => collectImages(content), [content])
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const converters: JSXConvertersFunction = ({ defaultConverters }) => {
    const link: JSXConverter<LinkNode> = ({ node, nodesToJSX }) => {
      const children = nodesToJSX({ nodes: node.children })
      const href = safeLinkHref(node.fields?.url)
      if (!href) return <span>{children}</span>
      const external = isExternal(href)
      return (
        <a
          href={href}
          target={external || node.fields?.newTab ? '_blank' : undefined}
          rel={external || node.fields?.newTab ? 'noopener noreferrer' : undefined}
        >
          {children}
        </a>
      )
    }
    return {
      ...defaultConverters,
      link,
      autolink: link,
      upload: ({ node }) => {
        const value = (node as LexicalNode).value
        if (!isImage(value)) return null
        const index = images.indexOf(value)
        const alt = value.alt ?? ''
        return (
          <figure className="my-5">
            <button
              type="button"
              onClick={() => setLightboxIndex(index)}
              className="block w-full overflow-hidden rounded-2xl cursor-zoom-in"
            >
              <img
                src={value.url!}
                alt={alt}
                width={value.width ?? undefined}
                height={value.height ?? undefined}
                loading="lazy"
                className="w-full h-auto max-h-[70vh] object-cover"
              />
            </button>
            {alt && (
              <figcaption className="mt-2 text-center text-xs text-gray-500 dark:text-slate-400">
                {alt}
              </figcaption>
            )}
          </figure>
        )
      },
    }
  }

  const lightboxPhotos: LightboxPhoto[] = images.map((image) => ({ url: image.url, alt: image.alt }))

  return (
    <Sheet>
      <div className="flex items-center gap-3 pb-3 sm:pb-4 border-b-[3px] border-gray-100 dark:border-white/10 mb-5">
        <Icon size={22} className="text-primary dark:text-primary-light shrink-0" aria-hidden="true" />
        <h2 className="font-serif text-[22px] sm:text-[28px] font-black text-gray-900 dark:text-gray-100 m-0">
          {title}
        </h2>
      </div>
      <RichText
        data={content as SerializedEditorState}
        converters={converters}
        className="max-w-3xl text-[15px] leading-relaxed text-gray-700 dark:text-slate-300
          [&_h1]:font-serif [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-gray-900 dark:[&_h1]:text-gray-100 [&_h1]:mt-8 [&_h1]:mb-3
          [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 dark:[&_h2]:text-gray-100 [&_h2]:mt-7 [&_h2]:mb-3
          [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-gray-900 dark:[&_h3]:text-gray-100 [&_h3]:mt-5 [&_h3]:mb-2
          [&_h4]:font-semibold [&_h4]:mt-4 [&_h4]:mb-1
          [&_p]:my-3 [&_strong]:font-semibold [&_strong]:text-gray-900 dark:[&_strong]:text-gray-100
          [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-3 [&_li]:my-1 [&_li]:marker:text-primary
          [&_a]:text-primary-dark dark:[&_a]:text-primary-light [&_a]:underline [&_a]:underline-offset-2 [&_a]:font-medium
          [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4
          [&_hr]:my-7 [&_hr]:border-gray-100 dark:[&_hr]:border-white/10
          [&_code]:rounded [&_code]:bg-gray-100 dark:[&_code]:bg-white/10 [&_code]:px-1 [&_code]:text-[13px]
          [&>*:first-child]:mt-0"
      />
      {lightboxIndex !== null && lightboxPhotos.length > 0 && (
        <PhotoLightbox
          photos={lightboxPhotos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </Sheet>
  )
}
