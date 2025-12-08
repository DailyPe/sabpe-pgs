import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';

import { db } from '../../../../lib/firebase/client';

type PaymentStatus = 'success' | 'failure';

function normalizeStatus(raw: string | null | undefined): PaymentStatus | null {
    if (!raw) return null;
    const value = raw.toString().toUpperCase();
    const successValues = ['SUCCESS', 'COMPLETED', 'APPROVED', 'CONFIRMED', 'AUTHORIZED', 'AUTHORISED'];
    const failureValues = [
        'FAIL',
        'FAILED',
        'DECLINED',
        'ERROR',
        'CANCELLED',
        'CANCELED',
        'REFUSED',
        'TIMEOUT',
    ];

    if (successValues.includes(value)) return 'success';
    if (failureValues.includes(value)) return 'failure';
    return null;
}

async function resolveStatus(orderId: string | null, rawStatus: string | null): Promise<PaymentStatus> {
    const normalized = normalizeStatus(rawStatus);
    if (normalized) return normalized;

    if (!orderId) return 'failure';

    try {
        const snap = await getDoc(doc(db, 'payments', orderId));
        if (snap.exists()) {
            const data = snap.data() as { status?: string };
            if (data.status === 'success') return 'success';
            if (data.status === 'failure') return 'failure';
        }
    } catch (error) {
        console.error('Failed to load payment status for Unlimit return handler', error);
    }

    return 'failure';
}

function extractFromSearch(search: URLSearchParams) {
    const orderId =
        search.get('orderId') ??
        search.get('order_id') ??
        search.get('merchant_order[id]') ??
        search.get('merchant_order_id') ??
        search.get('payment_data[id]');
    const rawStatus =
        search.get('status') ??
        search.get('payment_status') ??
        search.get('payment_data[status]');
    return { orderId, rawStatus };
}

function extractFromRecord(record: Record<string, unknown>) {
    const orderId =
        (record.orderId as string | undefined) ??
        (record.order_id as string | undefined) ??
        (record.merchant_order as { id?: string } | undefined)?.id ??
        (record['merchant_order[id]'] as string | undefined) ??
        (record.payment_data as { id?: string } | undefined)?.id ??
        (record['payment_data[id]'] as string | undefined) ??
        null;
    const rawStatus =
        (record.status as string | undefined) ??
        (record.payment_status as string | undefined) ??
        (record.payment_data as { status?: string } | undefined)?.status ??
        (record['payment_data[status]'] as string | undefined) ??
        null;
    return { orderId: orderId ?? null, rawStatus: rawStatus ?? null };
}

async function redirectWithStatus({
    orderId,
    rawStatus,
    origin,
}: {
    orderId: string | null;
    rawStatus: string | null;
    origin: string;
}) {
    const status = await resolveStatus(orderId, rawStatus);

    const redirectUrl = new URL('/payment/result', origin);
    redirectUrl.searchParams.set('status', status);
    if (orderId) redirectUrl.searchParams.set('orderId', orderId);

    return NextResponse.redirect(redirectUrl.toString(), { status: 302 });
}

export async function GET(request: NextRequest) {
    const { orderId, rawStatus } = extractFromSearch(request.nextUrl.searchParams);
    return redirectWithStatus({
        orderId,
        rawStatus,
        origin: request.nextUrl.origin,
    });
}

export async function POST(request: NextRequest) {
    const contentType = request.headers.get('content-type') ?? '';
    let parsed: { orderId: string | null; rawStatus: string | null } = {
        orderId: null,
        rawStatus: null,
    };

    if (contentType.includes('application/json')) {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        parsed = extractFromRecord(body);
    } else {
        const formData = await request.formData();
        const record: Record<string, string> = {};
        for (const [key, value] of formData.entries()) {
            if (typeof value === 'string') {
                record[key] = value;
            }
        }
        parsed = extractFromRecord(record);
    }

    return redirectWithStatus({
        orderId: parsed.orderId,
        rawStatus: parsed.rawStatus,
        origin: request.nextUrl.origin,
    });
}




