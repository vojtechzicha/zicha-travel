/**
 * Migration script to import JSON config files into Payload CMS
 *
 * Usage:
 *   pnpm tsx src/scripts/migrate-json-configs.ts
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface JsonConfig {
  name: string
  shortName: string
  location: string
  config: {
    banker: string
    account: {
      number: string
      iban: string
    }
    contacts?: Record<string, { number: string; iban: string }>
  }
  participants: string[]
  expenses: Array<{
    id: number
    title: string
    amount: number
    payer: string
    weights: 'ALL' | Record<string, number>
  }>
  prepayments: Array<{
    from: string
    amount: number
    note?: string
  }>
  information?: {
    enabled: boolean
    dates?: {
      from: string
      to: string
    }
    destination?: {
      name: string
      location: string
      description: string
      links?: Array<{ title: string; url: string }>
    }
    photos?: string[]
    basicInfo?: string[]
    transportation?: {
      car?: Array<{
        from: string
        duration: string
        distance: string
        route: string
      }>
      parking?: string
      publicTransport?: Array<{
        title: string
        connections: Array<{
          type: 'vlak' | 'autobus'
          number: string
          from: string
          to: string
          departure: string
          arrival: string
        }>
        totalDuration?: string
        notes?: string
      }>
    }
    bedrooms?: Array<{
      name: string
      beds: Array<{
        type: string
        occupants: string[]
      }>
    }>
  }
}

interface DomainMap {
  domains: Record<
    string,
    {
      configFile: string
      name: string
      location: string
    }
  >
  default: string
}

async function migrateJsonConfigs() {
  console.log('Starting migration...\n')

  // Initialize Payload
  const payload = await getPayload({ config })
  console.log('Payload initialized\n')

  // Read domain-map.json
  const domainMapPath = path.resolve(__dirname, '../../split-expanses/public/configs/domain-map.json')
  const domainMap: DomainMap = JSON.parse(fs.readFileSync(domainMapPath, 'utf-8'))

  console.log('Domain map loaded:', Object.keys(domainMap.domains).length, 'domains\n')

  // Get list of all config files to import
  const configFiles = new Set<string>()
  Object.values(domainMap.domains).forEach((d) => configFiles.add(d.configFile))
  if (domainMap.default) {
    configFiles.add(domainMap.default)
  }

  // Remove template.json
  configFiles.delete('template.json')

  console.log('Config files to import:', Array.from(configFiles).join(', '), '\n')

  // Track created chatas
  const createdChatas: Record<string, any> = {}

  // Import each config file
  for (const configFile of configFiles) {
    console.log(`\n=== Importing ${configFile} ===\n`)

    const configPath = path.resolve(__dirname, `../../split-expanses/public/configs/${configFile}`)

    if (!fs.existsSync(configPath)) {
      console.log(`  ⚠️  Config file not found: ${configPath}`)
      continue
    }

    const jsonConfig: JsonConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

    // Generate slug from name
    const slug = jsonConfig.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    console.log(`  Creating chata: ${jsonConfig.name} (slug: ${slug})`)

    // Find domains that map to this config
    const domains = Object.entries(domainMap.domains)
      .filter(([_, d]) => d.configFile === configFile)
      .map(([hostname]) => ({ domain: hostname }))

    console.log(`  Domains: ${domains.map((d) => d.domain).join(', ') || 'none'}`)

    // Create chata first (without banker reference)
    console.log(`\n  Creating chata...`)
    const chataData: any = {
      name: jsonConfig.name,
      shortName: jsonConfig.shortName,
      location: jsonConfig.location,
      slug,
      domains,
      // banker will be set after participants are created
      bankerAccountNumber: jsonConfig.config.account.number,
      bankerIban: jsonConfig.config.account.iban,
      informationEnabled: jsonConfig.information?.enabled || false,
    }

    // Add trip information if present
    if (jsonConfig.information?.enabled) {
      if (jsonConfig.information.dates) {
        chataData.tripDateFrom = jsonConfig.information.dates.from
        chataData.tripDateTo = jsonConfig.information.dates.to
      }

      if (jsonConfig.information.destination) {
        chataData.destinationName = jsonConfig.information.destination.name
        chataData.destinationLocation = jsonConfig.information.destination.location
        chataData.destinationDescription = jsonConfig.information.destination.description
        chataData.destinationLinks = jsonConfig.information.destination.links || []
      }

      chataData.basicInfo = (jsonConfig.information.basicInfo || []).map((info) => ({ info }))
      chataData.parking = jsonConfig.information.transportation?.parking || ''
      chataData.carRoutes = jsonConfig.information.transportation?.car || []
      chataData.publicTransportOptions = jsonConfig.information.transportation?.publicTransport || []
      chataData.bedrooms = (jsonConfig.information.bedrooms || []).map((br) => ({
        name: br.name,
        beds: br.beds.map((b) => ({
          type: b.type,
          occupants: b.occupants.map((name) => participantMap[name]).filter(Boolean),
        })),
      }))
    }

    const chata = await payload.create({
      collection: 'chatas',
      data: chataData,
    })

    createdChatas[configFile] = chata
    console.log(`    ✓ Chata created (ID: ${chata.id})`)

    // Create participants with chata reference
    console.log(`\n  Creating ${jsonConfig.participants.length} participants...`)
    const participantMap: Record<string, string> = {}

    for (const participantName of jsonConfig.participants) {
      const bankingInfo = jsonConfig.config.contacts?.[participantName]

      const participant = await payload.create({
        collection: 'participants',
        data: {
          name: participantName,
          chata: chata.id,
          accountNumber: bankingInfo?.number || '',
          iban: bankingInfo?.iban || '',
        },
      })

      participantMap[participantName] = participant.id
      console.log(`    ✓ ${participantName}`)
    }

    // Update chata with banker reference
    console.log(`\n  Updating chata with banker...`)
    await payload.update({
      collection: 'chatas',
      id: chata.id,
      data: {
        banker: participantMap[jsonConfig.config.banker],
      },
    })
    console.log(`    ✓ Banker set to ${jsonConfig.config.banker}`)

    // Create expenses
    console.log(`\n  Creating ${jsonConfig.expenses.length} expenses...`)
    for (const expense of jsonConfig.expenses) {
      const expenseData: any = {
        chata: chata.id,
        title: expense.title,
        amount: expense.amount,
        payer: participantMap[expense.payer],
        splitType: expense.weights === 'ALL' ? 'equal' : 'weighted',
      }

      if (expense.weights !== 'ALL') {
        expenseData.weights = Object.entries(expense.weights).map(([name, weight]) => ({
          participant: participantMap[name],
          weight,
        }))
      }

      await payload.create({
        collection: 'expenses',
        data: expenseData,
      })
      console.log(`    ✓ ${expense.title}`)
    }

    // Create prepayments
    console.log(`\n  Creating ${jsonConfig.prepayments.length} prepayments...`)
    for (const prepayment of jsonConfig.prepayments) {
      // Auto-detect type
      let type: 'advance' | 'supplement' | 'refund' | 'distribution' = 'advance'
      if (prepayment.amount < 0) {
        type = 'refund'
      } else if (prepayment.note?.toLowerCase().includes('distribuce')) {
        type = 'distribution'
      } else if (prepayment.note?.toLowerCase().includes('doplatek')) {
        type = 'supplement'
      }

      await payload.create({
        collection: 'prepayments',
        data: {
          chata: chata.id,
          from: participantMap[prepayment.from],
          amount: prepayment.amount,
          note: prepayment.note || '',
          type,
        },
      })
      console.log(`    ✓ ${prepayment.from}: ${prepayment.amount}`)
    }

    console.log(`\n  ✅ Successfully imported ${configFile}`)
  }

  // Set default chata in domain-mappings global
  if (domainMap.default && createdChatas[domainMap.default]) {
    console.log(`\n=== Setting default chata ===`)
    console.log(`  Default: ${domainMap.default}`)

    await payload.updateGlobal({
      slug: 'domain-mappings',
      data: {
        defaultChata: createdChatas[domainMap.default].id,
      },
    })

    console.log(`  ✓ Default chata set`)
  }

  console.log('\n\n=== Migration Complete ===')
  console.log(`Imported ${Object.keys(createdChatas).length} chatas`)
  console.log('\nYou can now access the Payload admin at http://localhost:3000/admin')

  process.exit(0)
}

migrateJsonConfigs().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
