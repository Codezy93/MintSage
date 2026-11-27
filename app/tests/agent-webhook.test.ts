import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { POST } from '@/app/api/plaid/webhook/route'

const fixtures=vi.hoisted(()=>({key:vi.fn(),lookup:vi.fn(),sync:vi.fn()}))
vi.mock('@/lib/plaid/config',()=>({plaidClient:{webhookVerificationKeyGet:fixtures.key}}))
vi.mock('@/lib/supabase/private',()=>({privateClient:()=>({from:()=>({select:()=>({eq:fixtures.lookup})})})}))
vi.mock('@/lib/transactions/transactions',()=>({syncOwner:fixtures.sync}))
it('dispatches a signed Sandbox sync notification to the linked Item owner',async()=>{
  const pair=generateKeyPairSync('ec',{namedCurve:'P-256'})
  const body=JSON.stringify({webhook_type:'TRANSACTIONS',webhook_code:'SYNC_UPDATES_AVAILABLE',item_id:'sandbox-item'})
  const encode=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url')
  const unsigned=encode({alg:'ES256',kid:'key'})+'.'+encode({iat:Math.floor(Date.now()/1000),request_body_sha256:createHash('sha256').update(body).digest('hex')})
  const token=unsigned+'.'+sign('sha256',Buffer.from(unsigned),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')
  fixtures.key.mockResolvedValue({data:{key:{...pair.publicKey.export({format:'jwk'}),alg:'ES256',kid:'key'}}})
  fixtures.lookup.mockReturnValue({maybeSingle:async()=>({data:{id:'owner'}})})
  const post=(payload:string)=>POST(new Request('https://fixture.invalid',{method:'POST',body:payload,headers:{'Plaid-Verification':token}}))
  expect((await post(body)).status).toBe(204)
  expect(fixtures.lookup).toHaveBeenCalledWith('item_id','sandbox-item')
  expect(fixtures.sync).toHaveBeenCalledWith('owner','sandbox-item')
  expect((await post(body+' ')).status).toBe(401)
  expect(fixtures.sync).toHaveBeenCalledTimes(1)
})
