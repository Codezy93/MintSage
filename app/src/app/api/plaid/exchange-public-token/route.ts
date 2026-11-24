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

        const body = await request.json().catch(() => null);
        if (typeof body?.public_token !== 'string' || !body.public_token.trim()) {
            return NextResponse.json(
                { error: 'Missing public_token when exchanging token' },
                { status: 400 },
            );
        }

        const exchangeResponse = await plaidClient
            .itemPublicTokenExchange({ public_token: body.public_token })
            .then((res) => res.data);

        await savePlaidToken(user, exchangeResponse.access_token);
        return NextResponse.json({ connected: true });
    } catch {
        console.error('Failed to complete Plaid token exchange or storage');
        return NextResponse.json(
            { error: 'Failed to exchange Plaid public token' },
            { status: 500 },
        );
    }
}
