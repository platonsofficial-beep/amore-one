import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const applySql = readFileSync(resolve(process.cwd(), 'supabase/reservations_seated_at.sql'), 'utf8')
const verifySql = readFileSync(resolve(process.cwd(), 'supabase/reservations_seated_at_verify.sql'), 'utf8')
const rollbackSql = readFileSync(resolve(process.cwd(), 'supabase/reservations_seated_at_rollback.sql'), 'utf8')

describe('reservations seated_at sql', () => {
  it('adds a nullable stamp and does not rewrite existing rows', () => {
    expect(applySql).toContain('SQL NOT APPLIED')
    expect(applySql).toContain('add column if not exists seated_at timestamptz')
    expect(applySql).not.toMatch(/\b(delete|update)\s+public\.reservations\b/i)
    expect(applySql).toContain("'Checked In'")
    expect(applySql).toContain("'Walk In'")
    expect(applySql).toContain("'Checked In (Partial)'")
    expect(applySql).toContain("'Confirmed'")
    expect(applySql).toContain("'Not Confirmed'")
    expect(applySql).toContain('new.seated_at := now()')
    expect(applySql).toContain('new.seated_at := null')
    expect(applySql).not.toContain("'Checked Out'")
    expect(applySql).toContain('before insert or update of status')
  })

  it('verifies the column and trigger without writing', () => {
    expect(verifySql).not.toMatch(/\b(insert|update|delete|alter|drop)\b/i)
    expect(verifySql).toContain('seated_at')
    expect(verifySql).toContain('reservations_set_seated_at')
  })

  it('rolls back the trigger and column without deleting reservations', () => {
    expect(rollbackSql).toContain('drop trigger if exists reservations_set_seated_at')
    expect(rollbackSql).toContain('drop function if exists public.reservations_set_seated_at()')
    expect(rollbackSql).toContain('drop column if exists seated_at')
    expect(rollbackSql).not.toMatch(/\bdelete\s+from\b/i)
  })
})
