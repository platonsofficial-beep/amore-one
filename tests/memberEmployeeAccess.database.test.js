// Executes the actual PostgreSQL policies and triggers, not SQL string assertions.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest'

const sql = (name) => readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8')
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const workspace = id(100)
const otherWorkspace = id(200)
let db
async function asUser(n, role = 'authenticated') {
  await db.exec(`reset role; set role ${role}; set request.jwt.claim.sub = '${id(n)}';`)
}
async function privateFields() {
  return (await db.query('select * from public.get_employee_private_fields($1, $2)', [workspace, [id(11)]])).rows[0]
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
  `)
  for (const name of ['workspaces_schema.sql', 'employees_schema.sql', 'employees_identity_schema.sql',
    'workspace_members_schema.sql', 'workspace_members_rls_policies.sql']) await db.exec(sql(name))
  // Load the production helper definitions without unrelated stock tables.
  await db.exec(sql('stock_rls_policies.sql').split('grant select, insert, update, delete on table public.stock_items')[0])
  await db.exec('create table public.employee_positions (employee_id uuid, position_id bigint);')
  for (const name of ['employees_rls_policies.sql', 'workspace_invites_schema.sql',
    'workspace_invites_rls_policies.sql', 'employees_identity_rpc.sql']) await db.exec(sql(name))
  await db.exec(sql('member_employee_access_hardening.sql'))
  // Re-running the release must also be safe.
  await db.exec(sql('member_employee_access_hardening.sql'))
  await db.exec(`insert into public.workspaces (id,name,slug) values
    ('${workspace}','Venue','venue'), ('${otherWorkspace}','Other','other');`)
  for (const [n, role] of [[1, 'owner'], [2, 'general_manager'], [3, 'manager'], [4, 'staff'], [5, 'host'], [6, 'staff']]) {
    const ws = n === 6 ? otherWorkspace : workspace
    await db.exec(`insert into auth.users(id,email) values ('${id(n)}','user${n}@example.com');
      insert into public.employees(id,workspace_id,full_name,salary,notes,emergency_contact)
        values ('${id(n + 10)}','${ws}','Employee ${n}',42000,'Private note','Emergency contact');
      insert into public.workspace_members(workspace_id,auth_user_id,employee_id,role)
        values ('${ws}','${id(n)}','${id(n + 10)}','${role}');`)
  }
}, 30000)
beforeEach(async () => db.exec('begin'))
afterEach(async () => db.exec('rollback; reset role'))
afterAll(async () => db?.close())

describe('employee privacy and write authorization', () => {
  it.each([1, 2, 3, 4, 5])('denies direct salary reads for API user %s', async (n) => {
    await asUser(n)
    await expect(db.query('select salary from public.employees')).rejects.toMatchObject({ code: '42501' })
  })
  it.each([1, 2])('returns salaries through the checked RPC to Owner/GM %s', async (n) => {
    await asUser(n)
    expect(await privateFields()).toMatchObject({ salary: '42000', notes: 'Private note' })
  })
  it('returns manager details without salary', async () => {
    await asUser(3)
    expect(await privateFields()).toMatchObject({ salary: null, notes: 'Private note', emergency_contact: 'Emergency contact' })
  })
  it.each([4, 5])('redacts all private fields for staff/host %s', async (n) => {
    await asUser(n)
    expect(await privateFields()).toMatchObject({ salary: null, notes: null, emergency_contact: null })
  })
  it('denies a different workspace', async () => {
    await asUser(6)
    await expect(privateFields()).rejects.toMatchObject({ code: '42501' })
  })
  it('denies anonymous RPC calls', async () => {
    await asUser(4, 'anon')
    await expect(privateFields()).rejects.toMatchObject({ code: '42501' })
  })
  it('allows staff phone changes and identity RPC without revealing private columns', async () => {
    await asUser(4)
    const result = await db.query(`update public.employees set phone = '+357123' where id = $1 returning id,phone`, [id(14)])
    expect(result.rows[0].phone).toBe('+357123')
    const color = await db.query('select * from public.assign_employee_identity_color($1,$2,$3)', [workspace,id(14),'emerald'])
    expect(color.rows[0].identity_color).toBe('emerald')
  })
  it('denies staff changes to employment data', async () => {
    await asUser(4)
    await expect(db.query("update public.employees set weekly_hours=1 where id=$1", [id(14)]))
      .rejects.toMatchObject({ code: '42501' })
  })
  it.each(['notes', 'emergency_contact'])('denies direct %s reads', async (column) => {
    await asUser(4)
    await expect(db.query(`select ${column} from public.employees`)).rejects.toMatchObject({ code: '42501' })
  })
  it('allows manager employee creation without salary', async () => {
    await asUser(3)
    const result = await db.query(`insert into public.employees(workspace_id,full_name,notes)
      values($1,'New employee','Internal') returning id,full_name`, [workspace])
    expect(result.rows[0].full_name).toBe('New employee')
  })
  it('denies manager salary insertion', async () => {
    await asUser(3)
    await expect(db.query('insert into public.employees(workspace_id,salary) values($1,42000)', [workspace]))
      .rejects.toMatchObject({ code: '42501' })
  })
  it('denies manager salary writes', async () => {
    await asUser(3)
    await expect(db.query('update public.employees set salary=1 where id=$1', [id(11)]))
      .rejects.toMatchObject({ code: '42501' })
  })
  it('allows manager edits without changing salary', async () => {
    await asUser(3)
    await db.query("update public.employees set full_name='Updated',notes='Updated note' where id=$1 returning id,full_name", [id(11)])
    await asUser(1)
    expect(await privateFields()).toMatchObject({ salary: '42000', notes: 'Updated note' })
  })
  it('allows Owner salary changes with a safe returning projection', async () => {
    await asUser(1)
    await db.query('update public.employees set salary=50000 where id=$1 returning id', [id(11)])
    expect((await privateFields()).salary).toBe('50000')
  })
})

describe('membership and invitation escalation protection', () => {
  it('allows a display-name refresh', async () => {
    await asUser(4)
    const result = await db.query("update public.workspace_members set display_name='Updated' where auth_user_id=$1 returning display_name", [id(4)])
    expect(result.rows[0].display_name).toBe('Updated')
  })
  it.each(['owner','general_manager','manager'])('denies self-promotion to %s', async (role) => {
    await asUser(4)
    await expect(db.query('update public.workspace_members set role=$1 where auth_user_id=$2', [role,id(4)]))
      .rejects.toMatchObject({ code: '42501' })
  })
  it('denies self-linking to another employee', async () => {
    await asUser(4)
    await expect(db.query('update public.workspace_members set employee_id=$1 where auth_user_id=$2', [id(11),id(4)]))
      .rejects.toMatchObject({ code: '42501' })
  })
  it('denies moving a membership to another workspace', async () => {
    await asUser(4)
    await expect(db.query('update public.workspace_members set workspace_id=$1 where auth_user_id=$2', [otherWorkspace,id(4)]))
      .rejects.toMatchObject({ code: '42501' })
  })
  it('allows GM self-linking within their workspace', async () => {
    await asUser(2)
    const result = await db.query('update public.workspace_members set employee_id=$1 where auth_user_id=$2 returning employee_id', [id(15),id(2)])
    expect(result.rows[0].employee_id).toBe(id(15))
  })
  it('denies cross-workspace links even for owners', async () => {
    await asUser(1)
    await expect(db.query('update public.workspace_members set employee_id=$1 where auth_user_id=$2', [id(16),id(4)]))
      .rejects.toMatchObject({ code: '42501' })
  })
  it('does not let staff delete their membership', async () => {
    await asUser(4)
    const result = await db.query('delete from public.workspace_members where auth_user_id=$1 returning id', [id(4)])
    expect(result.rows).toHaveLength(0)
  })
  it.each(['owner','general_manager','manager'])('denies manager-issued %s invitations', async (role) => {
    await asUser(3)
    await expect(db.query(`insert into public.workspace_invites(workspace_id,employee_id,role,token,invited_by,expires_at)
      values($1,$2,$3,'test',$4,now()+interval '1 day')`, [workspace,id(14),role,id(3)]))
      .rejects.toMatchObject({ code: '42501' })
  })
  it('allows an owner-issued manager invitation to be accepted by existing staff', async () => {
    await asUser(1)
    await db.query(`insert into public.workspace_invites(workspace_id,employee_id,role,token,invited_by,expires_at)
      values($1,$2,'manager','test',$3,now()+interval '1 day')`, [workspace,id(14),id(1)])
    await asUser(4)
    const result = await db.query("select public.accept_workspace_invite('test') as member")
    expect(result.rows[0].member.role).toBe('manager')
    expect(result.rows[0].member.employee_id).toBe(id(14))
  })
  it('allows manager-issued staff invitations and revocation', async () => {
    await asUser(3)
    await db.query(`insert into public.workspace_invites(workspace_id,employee_id,role,token,invited_by,expires_at)
      values($1,$2,'staff','test',$3,now()+interval '1 day')`, [workspace,id(14),id(3)])
    const result = await db.query("update public.workspace_invites set revoked_at=now() where token='test' returning revoked_at")
    expect(result.rows[0].revoked_at).toBeTruthy()
  })
  it('denies promoting an existing invitation', async () => {
    await asUser(3)
    await db.query(`insert into public.workspace_invites(workspace_id,employee_id,role,token,invited_by,expires_at)
      values($1,$2,'staff','test',$3,now()+interval '1 day')`, [workspace,id(14),id(3)])
    await expect(db.query("update public.workspace_invites set role='owner' where token='test'"))
      .rejects.toMatchObject({ code: '42501' })
  })
})
