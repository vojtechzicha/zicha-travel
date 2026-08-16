import { APIError, type CollectionConfig } from 'payload'
import { isSuperadmin } from '../lib/access'
import { pickValidationMessage } from '../i18n/adminTranslations'
import { isExternalImageUrl, selfHostImage, SelfHostImageError } from '../utils/selfHostImage'

export const Backgrounds: CollectionConfig = {
  slug: 'backgrounds',
  labels: {
    singular: { en: 'Background', cs: 'Pozadí' },
    plural: { en: 'Backgrounds', cs: 'Pozadí' },
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'isDefault', 'type'],
    group: { en: 'Appearance', cs: 'Vzhled' },
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => isSuperadmin(user),
    update: ({ req: { user } }) => isSuperadmin(user),
    delete: ({ req: { user }, data }) => {
      if (!isSuperadmin(user)) return false
      return !data?.isDefault // Prevent deletion of default
    },
  },
  hooks: {
    // Fetch-and-store (compliance-gaps blocker 10, decision 9): a pasted
    // external image URL is downloaded on save and stored as a `media`
    // document, and the row converts to `type: 'upload'` — visitors never
    // load anything from the external host. Relative URLs (e.g.
    // `/bg/mountains-1920.avif` in public/) are already self-hosted and are
    // left as url-type rows; the frontend renders them as-is (ThemeProvider,
    // chataIdentity both pass the string through unchanged).
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        // `data` may be partial on update — resolve the effective values.
        const type = data?.type ?? originalDoc?.type
        const url = data?.url ?? originalDoc?.url
        if (type !== 'url' || !isExternalImageUrl(url)) return data

        try {
          const mediaId = await selfHostImage(req.payload, {
            url,
            alt: data?.name ?? originalDoc?.name ?? 'Background',
          })
          // Keep `url` (hidden by the field condition once type is 'upload')
          // as a provenance record of where the copy came from — clearing it
          // would lose the only pointer back to the original source.
          return { ...data, type: 'upload' as const, image: mediaId }
        } catch (err) {
          const detail =
            err instanceof SelfHostImageError ? err.detail : err instanceof Error ? err.message : ''
          const reason = err instanceof SelfHostImageError ? err.reason : 'fetch-failed'
          const messages: Record<string, [english: string, czech: string]> = {
            'invalid-url': [
              `The URL is not a valid http(s) address (${detail}).`,
              `Adresa není platná http(s) URL (${detail}).`,
            ],
            'not-an-image': [
              `The URL does not point to an image (server returned "${detail}").`,
              `Adresa nevede na obrázek (server vrátil „${detail}“).`,
            ],
            'too-large': [
              `The image is larger than the 10 MB limit (${detail}). Use a smaller image or upload it manually.`,
              `Obrázek je větší než limit 10 MB (${detail}). Použijte menší obrázek, nebo jej nahrajte ručně.`,
            ],
          }
          const [english, czech] = messages[reason] ?? [
            `Could not download the image from the URL (${detail}). Check the address or upload the file instead.`,
            `Obrázek se z adresy nepodařilo stáhnout (${detail}). Zkontrolujte adresu, nebo soubor nahrajte ručně.`,
          ]
          throw new APIError(pickValidationMessage(req, english, czech), 400)
        }
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: {
          en: 'Display name for this background',
          cs: 'Zobrazovaný název tohoto pozadí',
        },
      },
    },
    {
      name: 'isDefault',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: {
          en: 'System default - cannot be deleted',
          cs: 'Systémové výchozí – nelze smazat',
        },
        readOnly: true,
      },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'url',
      options: [
        { label: { en: 'External URL', cs: 'Externí URL' }, value: 'url' },
        { label: { en: 'Uploaded Image', cs: 'Nahraný obrázek' }, value: 'upload' },
      ],
    },
    {
      name: 'url',
      type: 'text',
      admin: {
        description: {
          en: 'Image URL. An external http(s) image is downloaded on save and stored in the site’s own storage (the row switches to "Uploaded Image"); a relative URL (e.g. /bg/…) is served as-is.',
          cs: 'URL obrázku. Externí http(s) obrázek se při uložení stáhne a uloží do vlastního úložiště webu (záznam se přepne na „Nahraný obrázek“); relativní URL (např. /bg/…) se použije beze změny.',
        },
        condition: (data) => data.type === 'url',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: {
          en: 'Upload a background image',
          cs: 'Nahrajte obrázek pozadí',
        },
        condition: (data) => data.type === 'upload',
      },
    },
  ],
}
