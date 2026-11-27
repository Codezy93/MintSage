import { z } from 'zod';
import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid/config';
import { savePlaidToken } from '@/lib/plaid/tokens';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const parsed = z.object({ public_token: z.string().trim().min(1) }).safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Missing public_token when exchanging token' },
                { status: 400 },
            );
        }

        const exchangeResponse = await plaidClient
            .itemPublicTokenExchange({ public_token: parsed.data.public_token })
            .then((res) => res.data);

        const exchanged = z.object({ access_token: z.string().min(1),item_id:z.string().min(1) }).parse(exchangeResponse);
        await savePlaidToken(user, exchanged.access_token, exchanged.item_id);
        return NextResponse.json({ connected: true });
    } catch {
        console.error('Failed to complete Plaid token exchange or storage');
        return NextResponse.json(
            { error: 'Failed to exchange Plaid public token' },
            { status: 500 },
        );
    }
}
