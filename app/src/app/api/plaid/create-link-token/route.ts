import { NextResponse } from 'next/server';
import {
    CountryCode,
    LinkTokenCreateResponse,
    Products,
} from 'plaid';
import { plaidClient } from '@/lib/plaid/config';
import { createClient } from '@/lib/supabase/server';

function parseProducts(): Products[] {
    const fromEnv = process.env.NEXT_PUBLIC_PLAID_PRODUCTS;
    if (!fromEnv) {
        return [Products.Transactions];
    }

    return fromEnv
        .split(',')
        .map((product) => product.trim().toLowerCase())
        .filter(Boolean) as Products[];
}

export async function POST() {
    try {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const plaidResponse: LinkTokenCreateResponse = await plaidClient
            .linkTokenCreate({
                client_name: 'MintSage',
                user: { client_user_id: user.id },
                language: 'en',
                country_codes: [CountryCode.Us],
                products: parseProducts(),
                redirect_uri: process.env.NEXT_PUBLIC_PLAID_REDIRECT_URI || undefined,
            })
            .then((res) => res.data);

        return NextResponse.json({ link_token: plaidResponse.link_token });
    } catch {
        console.error('Failed to create Plaid link token');
        return NextResponse.json(
            { error: 'Failed to create Plaid link token' },
            { status: 500 },
        );
    }
}

