/**
 * P8.31.7a — Product Identity & Computed Display Name Contract
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PRODUCT_IDENTITY_EXCLUDED_FIELDS,
  PRODUCT_IDENTITY_FIELDS,
  buildProductDisplayName,
  buildProductIdentityKey,
  normalizeProductIdentityComponent,
} from './stockProductIdentity.js'

describe('normalizeProductIdentityComponent', () => {
  it('trims and collapses whitespace without changing casing or Unicode', () => {
    expect(normalizeProductIdentityComponent('  Belvedere  ')).toBe('Belvedere')
    expect(normalizeProductIdentityComponent('Vodka   10')).toBe('Vodka 10')
    expect(normalizeProductIdentityComponent(' Κτήμα  Καριπίδη ')).toBe('Κτήμα Καριπίδη')
    expect(normalizeProductIdentityComponent(null)).toBe('')
    expect(normalizeProductIdentityComponent(undefined)).toBe('')
    expect(normalizeProductIdentityComponent('')).toBe('')
    expect(normalizeProductIdentityComponent('   ')).toBe('')
  })
})

describe('buildProductDisplayName', () => {
  it('joins Brand + Name + Size with one space', () => {
    expect(buildProductDisplayName({
      brand: 'Belvedere',
      name: 'Vodka',
      size: '1 L',
    })).toBe('Belvedere Vodka 1 L')

    expect(buildProductDisplayName({
      brand: 'Belvedere',
      name: 'Vodka 10',
      size: '700 ml',
    })).toBe('Belvedere Vodka 10 700 ml')

    expect(buildProductDisplayName({
      brand: 'Coca-Cola',
      name: 'Zero',
      size: '250 ml',
    })).toBe('Coca-Cola Zero 250 ml')
  })

  it('supports Name + Size, Brand + Name, and Name only', () => {
    expect(buildProductDisplayName({
      brand: '',
      name: 'House Vanilla Syrup',
      size: '1 L',
    })).toBe('House Vanilla Syrup 1 L')

    expect(buildProductDisplayName({
      brand: 'Coca-Cola',
      name: 'Zero',
      size: null,
    })).toBe('Coca-Cola Zero')

    expect(buildProductDisplayName({
      brand: null,
      name: 'House Ice',
      size: undefined,
    })).toBe('House Ice')
  })

  it('preserves Greek / Unicode and trims components', () => {
    expect(buildProductDisplayName({
      brand: ' Κτήμα Καριπίδη ',
      name: ' Μαλαγουζιά ',
      size: '750 ml',
    })).toBe('Κτήμα Καριπίδη Μαλαγουζιά 750 ml')
  })

  it('is deterministic and does not mutate the input object', () => {
    const input = Object.freeze({
      brand: '  Belvedere ',
      name: 'Vodka',
      size: '1 L',
    })
    const first = buildProductDisplayName(input)
    const second = buildProductDisplayName(input)
    expect(first).toBe('Belvedere Vodka 1 L')
    expect(second).toBe(first)
    expect(input.brand).toBe('  Belvedere ')
  })

  it('returns empty string when every component is empty', () => {
    expect(buildProductDisplayName({})).toBe('')
    expect(buildProductDisplayName({ brand: '  ', name: null, size: '' })).toBe('')
  })

  it('does not strip duplicated brand tokens from name', () => {
    expect(buildProductDisplayName({
      brand: 'Belvedere',
      name: 'Belvedere Vodka',
      size: '1 L',
    })).toBe('Belvedere Belvedere Vodka 1 L')
  })
})

describe('buildProductIdentityKey', () => {
  it('is whitespace- and casing-insensitive for the same commercial identity', () => {
    const a = buildProductIdentityKey({
      brand: 'Belvedere',
      name: 'Vodka',
      size: '1 L',
    })
    const b = buildProductIdentityKey({
      brand: '  belvedere ',
      name: ' VODKA ',
      size: '1   L',
    })
    expect(a).toBe(b)
  })

  it('treats different sizes and different names as different identities', () => {
    const oneLiter = buildProductIdentityKey({
      brand: 'Belvedere',
      name: 'Vodka',
      size: '1 L',
    })
    const sevenHundred = buildProductIdentityKey({
      brand: 'Belvedere',
      name: 'Vodka',
      size: '700 ml',
    })
    const zero = buildProductIdentityKey({
      brand: 'Coca-Cola',
      name: 'Zero',
      size: '250 ml',
    })
    const original = buildProductIdentityKey({
      brand: 'Coca-Cola',
      name: 'Original',
      size: '250 ml',
    })

    expect(oneLiter).not.toBe(sevenHundred)
    expect(zero).not.toBe(original)
  })

  it('ignores supplier, cost, storage, quantity, barcode, packaging, and unit', () => {
    const base = {
      brand: 'Belvedere',
      name: 'Vodka',
      size: '1 L',
    }
    const polluted = {
      ...base,
      unit: 'Bottle',
      packagingNote: 'Usually supplied in cases',
      packaging_note: 'Case 6',
      supplier: 'Other Supplier',
      supplierId: 'abc',
      costPrice: 99,
      storageLocation: 'Cellar',
      currentQuantity: 42,
      barcode: '9999999999999',
      variant: 'should-not-matter',
    }

    expect(buildProductIdentityKey(polluted)).toBe(buildProductIdentityKey(base))
  })

  it('does not mutate the input object', () => {
    const input = {
      brand: 'Coca-Cola',
      name: 'Zero',
      size: '250 ml',
      barcode: '123',
    }
    const snapshot = { ...input }
    buildProductIdentityKey(input)
    expect(input).toEqual(snapshot)
  })
})

describe('product identity contract boundaries', () => {
  it('locks Brand + Name + Size and excludes Variant', () => {
    expect(PRODUCT_IDENTITY_FIELDS).toEqual(['brand', 'name', 'size'])
    expect(PRODUCT_IDENTITY_FIELDS).not.toContain('variant')
    expect(PRODUCT_IDENTITY_EXCLUDED_FIELDS).toContain('variant')
    expect(PRODUCT_IDENTITY_EXCLUDED_FIELDS).toContain('barcode')
    expect(PRODUCT_IDENTITY_EXCLUDED_FIELDS).toContain('unit')
  })

  it('source has no duplicate cleanup or quantity math implementations', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/stockProductIdentity.js'), 'utf8')
    expect(source).not.toMatch(/function\s+(stripBrand|deduplicate|tokenize|detectFlavour)/i)
    expect(source).not.toMatch(/quantity\s*\*|multiply\s*\(/i)
    expect(source).not.toMatch(/buildProductVariant|variant:/)
    expect(source).toContain('No Variant field')
    expect(source).toContain('buildProductDisplayName')
    expect(source).toContain('buildProductIdentityKey')
  })

  it('is not imported by production modules yet', () => {
    /** @param {string} dir */
    function walk(dir) {
      /** @type {string[]} */
      const files = []
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          files.push(...walk(full))
        } else if (/\.(js|jsx|ts|tsx)$/.test(entry)) {
          files.push(full)
        }
      }
      return files
    }

    const root = resolve(process.cwd(), 'src')
    const offenders = walk(root)
      .filter((file) => !file.includes('stockProductIdentity'))
      .filter((file) => !/\.(test|spec)\.(js|jsx|ts|tsx)$/.test(file))
      .filter((file) => readFileSync(file, 'utf8').includes('stockProductIdentity'))

    expect(offenders).toEqual([])
  })
})
