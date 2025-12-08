import { NextRequest, NextResponse } from 'next/server';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../../../lib/firebase/client';

export const runtime = 'nodejs';

/**
 * Decrypt SabPaisa response using AES-GCM + HMAC-SHA-384
 */
async function decryptSabPaisaData(
    encryptedHex: string,
    authKey: string,
    authIV: string,
): Promise<string | null> {
    try {
        const crypto = require('crypto').webcrypto;

        // Convert hex string to Uint8Array
        const hexToUint8Array = (hex: string): Uint8Array => {
            const bytes = new Uint8Array(hex.length / 2);
            for (let i = 0; i < hex.length; i += 2) {
                bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
            }
            return bytes;
        };

        const encryptedData = hexToUint8Array(encryptedHex);

        if (encryptedData.length < 76) {
            throw new Error('Invalid ciphertext length');
        }

        // Extract HMAC signature (first 48 bytes)
        const hmacSignature = encryptedData.slice(0, 48);
        // Extract IV + encrypted data (rest)
        const ivAndData = encryptedData.slice(48);

        // Decode keys from base64
        const encryptionKey = new Uint8Array(
            Buffer.from(authKey, 'base64'),
        );
        const hmacKey = new Uint8Array(Buffer.from(authIV, 'base64'));

        // Verify HMAC
        const hmacCryptoKey = await crypto.subtle.importKey(
            'raw',
            hmacKey,
            {
                name: 'HMAC',
                hash: 'SHA-384',
            },
            false,
            ['verify'],
        );

        const isValid = await crypto.subtle.verify(
            'HMAC',
            hmacCryptoKey,
            hmacSignature,
            ivAndData,
        );

        if (!isValid) {
            throw new Error('HMAC validation failed');
        }

        // Extract IV (first 12 bytes) and encrypted data (rest)
        const iv = ivAndData.slice(0, 12);
        const encrypted = ivAndData.slice(12);

        // Decrypt
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            encryptionKey,
            'AES-GCM',
            false,
            ['decrypt'],
        );

        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv,
                tagLength: 128,
            },
            cryptoKey,
            encrypted,
        );

        return new TextDecoder().decode(decrypted);
    } catch (error) {
        console.error('SabPaisa decryption error:', error);
        return null;
    }
}

/**
 * Parse decrypted data (URLSearchParams format: key=value&key=value)
 */
function parseDecryptedData(text: string): Record<string, string> {
    try {
        const params = new URLSearchParams(text);
        const data: Record<string, string> = {};
        for (const [key, value] of params.entries()) {
            data[key] = value;
        }
        return data;
    } catch (error) {
        console.error('Failed to parse decrypted data:', error);
        return {};
    }
}

export async function POST(request: NextRequest) {
    try {
        // Get encrypted response from SabPaisa
        const formData = await request.formData().catch(async () => {
            // Try JSON body if form data fails
            const json = await request.json().catch(() => ({}));
            return json as Record<string, string>;
        });

        const encResponse =
            (formData.get('encResponse') as string | null) ||
            (formData as Record<string, string>).encResponse ||
            (formData as Record<string, string>).ENCDATA ||
            null;

        if (!encResponse) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'No encrypted response received from SabPaisa',
                },
                { status: 400 },
            );
        }

        // Get credentials from environment variables
        const authKey = process.env.SABPAISA_AUTH_KEY;
        const authIV = process.env.SABPAISA_AUTH_IV;

        if (!authKey || !authIV) {
            console.error(
                'SabPaisa credentials not configured in environment variables',
            );
            return NextResponse.json(
                {
                    success: false,
                    error: 'Server configuration error',
                },
                { status: 500 },
            );
        }

        // Clean the encrypted response (remove spaces, handle URL encoding)
        const cleanEncResponse = encResponse.replace(/\s+/g, '').replace(/\+/g, ' ');

        // Decrypt the response
        const decrypted = await decryptSabPaisaData(
            cleanEncResponse,
            authKey,
            authIV,
        );

        if (!decrypted) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Failed to decrypt SabPaisa response',
                },
                { status: 500 },
            );
        }

        // Parse decrypted data
        const parsed = parseDecryptedData(decrypted);

        // Extract order ID and status
        const orderId =
            parsed.clientTxnId ||
            parsed.CLIENT_TXN_ID ||
            parsed.orderId ||
            parsed.ORDER_ID ||
            `sabpaisa_${Date.now().toString(36)}`;

        // Determine payment status
        let status: 'success' | 'failure' = 'failure';
        const statusText = (
            parsed.status ||
            parsed.STATUS ||
            parsed.responseMessage ||
            parsed.RESPONSE_MESSAGE ||
            '',
        )
            .toString()
            .toUpperCase();

        if (
            statusText.includes('SUCCESS') ||
            statusText.includes('COMPLETED') ||
            statusText.includes('APPROVED') ||
            statusText.includes('CAPTURED')
        ) {
            status = 'success';
        }

        // Save to Firestore
        try {
            const paymentsCollection = collection(db, 'payments');
            await setDoc(doc(paymentsCollection, orderId), {
                gateway: 'sabpaisa',
                status,
                orderId,
                encdata: encResponse,
                decryptedRaw: decrypted,
                receivedAt: serverTimestamp(),
                ...parsed, // All parsed fields as top-level
                raw: parsed, // Nested copy
            });
        } catch (firestoreError) {
            console.error('Failed to save to Firestore:', firestoreError);
            // Continue even if Firestore save fails
        }

        // Return success to SabPaisa
        return NextResponse.json({
            success: true,
            message: 'Webhook received and processed',
        });
    } catch (error) {
        console.error('Error processing SabPaisa webhook:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Internal server error',
            },
            { status: 500 },
        );
    }
}

