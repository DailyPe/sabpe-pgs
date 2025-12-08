import { NextRequest, NextResponse } from 'next/server';
import {
    collection,
    doc,
    serverTimestamp,
    setDoc,
} from 'firebase/firestore';

import { db } from '../../../../lib/firebase/client';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json().catch(() => ({}))) as {
            payment_method?: string;
            merchant_order?: { id?: string; description?: string };
            customer?: Record<string, unknown>;
            payment_data?: {
                id?: string;
                status?: string;
                amount?: number;
                currency?: string;
                [key: string]: unknown;
            };
            card_account?: Record<string, unknown>;
            [key: string]: unknown;
        };

        const paymentData = body.payment_data ?? {};
        const rawStatus = (paymentData.status ?? '').toString().toUpperCase();

        // Determine payment status based on actual Unlimit response format
        // Success: COMPLETED, APPROVED, CONFIRMED, AUTHORIZED, AUTHORISED
        // Failure: DECLINED, FAILED, CANCELLED, ERROR, etc.
        let status: 'success' | 'failure' = 'failure';
        const successStatuses = [
            'COMPLETED',
            'APPROVED',
            'CONFIRMED',
            'AUTHORIZED',
            'AUTHORISED',
        ];
        const failureStatuses = [
            'DECLINED',
            'FAILED',
            'FAIL',
            'CANCELLED',
            'CANCELED',
            'ERROR',
            'REFUSED',
            'TIMEOUT',
        ];

        if (successStatuses.includes(rawStatus)) {
            status = 'success';
        } else if (failureStatuses.includes(rawStatus)) {
            status = 'failure';
        } else if (rawStatus) {
            // If status exists but not in known lists, default to failure
            status = 'failure';
        }

        const orderId =
            body.merchant_order?.id ??
            paymentData.id ??
            `unlimit_${Date.now().toString(36)}`;

        // Save all fields to Firestore (matching the structure shown in user's data)
        await setDoc(doc(collection(db, 'payments'), orderId), {
            gateway: 'unlimit',
            status,
            orderId,
            receivedAt: serverTimestamp(),
            // Top-level fields for easy querying
            payment_method: body.payment_method ?? null,
            merchant_order: body.merchant_order ?? null,
            customer: body.customer ?? null,
            payment_data: paymentData,
            card_account: body.card_account ?? null,
            // Additional fields from payment_data for easy access
            amount: paymentData.amount ?? null,
            currency: paymentData.currency ?? null,
            payment_status: paymentData.status ?? null,
            payment_id: paymentData.id ?? null,
            rrn: paymentData.rrn ?? null,
            auth_code: paymentData.auth_code ?? null,
            // Full raw response
            raw: body,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in /api/unlimit/callback:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 },
        );
    }
}



