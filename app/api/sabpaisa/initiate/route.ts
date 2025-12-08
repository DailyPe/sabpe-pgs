import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface SabPaisaInitiateRequest {
    amount: string;
    payerName: string;
    payerEmail: string;
    payerMobile: string;
    clientTxnId?: string;
    utilityId?: string;
}

const LAMBDA_ENDPOINT =
    process.env.SABPAISA_LAMBDA_ENDPOINT ||
    'https://sshykykxg4.execute-api.ap-south-1.amazonaws.com/prod/sabpaisa/initiate';

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json().catch(() => ({}))) as SabPaisaInitiateRequest;

        const { amount, payerName, payerEmail, payerMobile, utilityId } = body;

        if (!amount || !payerName || !payerEmail || !payerMobile) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Missing required fields: amount, payerName, payerEmail, payerMobile',
                },
                { status: 400 },
            );
        }

        // Build callback URL - SabPaisa will redirect user here after payment
        const callbackUrl = 'https://prod.sabpe.com/api/sabpaisa/return';

        // Call Lambda function for payment initiation (encryption happens in Lambda with static IP)
        const lambdaResponse = await fetch(LAMBDA_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount: amount.trim(),
                payerName: payerName.trim(),
                payerEmail: payerEmail.trim(),
                payerMobile: payerMobile.trim(),
                utilityId: utilityId || 'utility',
                callbackUrl: callbackUrl, // Pass callback URL to Lambda
            }),
        });

        const lambdaData = await lambdaResponse.json().catch(() => ({}));

        if (!lambdaResponse.ok || !lambdaData.success) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        lambdaData.error ||
                        'Failed to initiate SabPaisa payment via Lambda',
                },
                { status: lambdaResponse.status || 500 },
            );
        }

        // Return the Lambda response (already in correct format)
        return NextResponse.json(lambdaData);
    } catch (error) {
        console.error('Error calling SabPaisa Lambda:', error);
        return NextResponse.json(
            {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Failed to initiate SabPaisa payment',
            },
            { status: 500 },
        );
    }
}

