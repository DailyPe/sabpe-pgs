/**
 * SabPaisa Payment Encryption for AWS Lambda
 * 
 * This file contains the correct encryption implementation for SabPaisa.
 * Copy this code to your Lambda function.
 * 
 * Requirements:
 * - Node.js 18+ (for Web Crypto API)
 * - Environment variables: SABPAISA_CLIENT_CODE, SABPAISA_TRANS_USER_NAME, 
 *   SABPAISA_TRANS_USER_PASSWORD, SABPAISA_AUTH_KEY, SABPAISA_AUTH_IV
 */

const { webcrypto } = require('crypto');

/**
 * Convert base64 string to Uint8Array
 */
function base64ToUint8Array(base64) {
    return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Encrypt SabPaisa payment data using AES-GCM + HMAC-SHA-384
 * 
 * @param {string} authKey - Base64 encoded AES-256 key
 * @param {string} authIV - Base64 encoded HMAC key (NOT encryption IV!)
 * @param {string} plaintext - Payment parameters as URLSearchParams string
 * @returns {Promise<string>} Uppercase hexadecimal encrypted string
 */
async function encryptSabPaisaData(authKey, authIV, plaintext) {
    const crypto = webcrypto;

    // Decode keys from base64
    const encryptionKey = base64ToUint8Array(authKey);
    const hmacKey = base64ToUint8Array(authIV);

    // Generate random 12-byte IV for AES-GCM (NOT from authIV!)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Import encryption key for AES-GCM
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        encryptionKey,
        'AES-GCM',
        false,
        ['encrypt']
    );

    // Encrypt the plaintext using AES-GCM
    const encrypted = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv,
            tagLength: 128 // 128-bit authentication tag
        },
        cryptoKey,
        new TextEncoder().encode(plaintext)
    );

    // Combine IV and encrypted data (encrypted includes the tag)
    const encryptedArray = new Uint8Array(encrypted);
    const ivAndData = new Uint8Array(iv.length + encryptedArray.length);
    ivAndData.set(iv, 0);
    ivAndData.set(encryptedArray, iv.length);

    // Import HMAC key for signing
    const hmacCryptoKey = await crypto.subtle.importKey(
        'raw',
        hmacKey,
        {
            name: 'HMAC',
            hash: 'SHA-384'
        },
        false,
        ['sign']
    );

    // Sign the encrypted data with HMAC-SHA-384
    const signature = await crypto.subtle.sign(
        'HMAC',
        hmacCryptoKey,
        ivAndData
    );

    // Combine: HMAC signature (48 bytes) + IV (12 bytes) + Encrypted data + Tag (16 bytes)
    const signatureArray = new Uint8Array(signature);
    const final = new Uint8Array(signatureArray.length + ivAndData.length);
    final.set(signatureArray, 0);
    final.set(ivAndData, signatureArray.length);

    // Convert to uppercase hexadecimal string
    return Array.from(final)
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join('');
}

/**
 * Build payment parameters string using URLSearchParams (matching SDK format)
 * 
 * Note: SabPaisa SDK uses URLSearchParams which creates URL-encoded format.
 * We sort the parameters alphabetically before building the string to match
 * SabPaisa's expected format.
 */
function buildPaymentParams(params) {
    // Filter out null/undefined/empty values
    const filteredParams = {};
    for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined && value !== '') {
            filteredParams[key] = String(value);
        }
    }

    // Sort keys alphabetically (as per SabPaisa requirement)
    const sortedKeys = Object.keys(filteredParams).sort();

    // Build URLSearchParams object with sorted keys (matches SDK behavior)
    const urlParams = new URLSearchParams();
    for (const key of sortedKeys) {
        urlParams.append(key, filteredParams[key]);
    }

    // Return as string (format: key1=value1&key2=value2)
    // URLSearchParams automatically URL-encodes values
    return urlParams.toString();
}

/**
 * Lambda handler
 */
exports.handler = async (event) => {
    try {
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;

        const {
            amount,
            payerName,
            payerEmail,
            payerMobile,
            utilityId,
            callbackUrl: requestCallbackUrl // Allow callback URL from request
        } = body;

        // Validate required fields (check for null, undefined, or empty strings)
        const trimmedAmount = amount ? String(amount).trim() : '';
        const trimmedPayerName = payerName ? String(payerName).trim() : '';
        const trimmedPayerEmail = payerEmail ? String(payerEmail).trim() : '';
        const trimmedPayerMobile = payerMobile ? String(payerMobile).trim() : '';

        if (!trimmedAmount || !trimmedPayerName || !trimmedPayerEmail || !trimmedPayerMobile) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'Missing or empty required fields',
                    details: {
                        amount: !trimmedAmount ? 'missing' : 'ok',
                        payerName: !trimmedPayerName ? 'missing' : 'ok',
                        payerEmail: !trimmedPayerEmail ? 'missing' : 'ok',
                        payerMobile: !trimmedPayerMobile ? 'missing' : 'ok'
                    }
                })
            };
        }

        // Get credentials from Lambda environment variables
        const clientCode = process.env.SABPAISA_CLIENT_CODE;
        const transUserName = process.env.SABPAISA_TRANS_USER_NAME;
        const transUserPassword = process.env.SABPAISA_TRANS_USER_PASSWORD;
        const authKey = process.env.SABPAISA_AUTH_KEY;
        const authIV = process.env.SABPAISA_AUTH_IV;
        const channelId = process.env.SABPAISA_CHANNEL_ID || 'npm';

        if (!clientCode || !transUserName || !transUserPassword || !authKey || !authIV) {
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'SabPaisa credentials not configured in Lambda environment variables'
                })
            };
        }

        // Generate client transaction ID
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        const clientTxnId = `SP_${timestamp}_${random}`;

        // Build callback URL
        // Priority: 1) From request, 2) Environment variable, 3) Default to prod.sabpe.com return endpoint
        const callbackUrl = requestCallbackUrl ||
            process.env.SABPAISA_CALLBACK_URL ||
            'https://prod.sabpe.com/api/sabpaisa/return';

        // Log the callback URL being used (for debugging whitelist issues)
        console.log('Callback URL being sent to SabPaisa:', callbackUrl);

        // Build payment parameters (MUST be sorted alphabetically)
        // Use trimmed values that were validated above
        const paymentParams = {
            amount: trimmedAmount,
            callbackUrl: callbackUrl.replace(/\/$/, ''), // Remove trailing slash
            channelId: channelId,
            clientCode: clientCode,
            clientTxnId: clientTxnId,
            payerEmail: trimmedPayerEmail,
            payerMobile: trimmedPayerMobile,
            payerName: trimmedPayerName, // This must not be null/empty
            transUserName: transUserName,
            transUserPassword: transUserPassword
        };

        // Double-check payerName is not empty (SabPaisa requirement)
        if (!paymentParams.payerName || paymentParams.payerName.length === 0) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: 'payerName cannot be empty'
                })
            };
        }

        // Build parameter string (sorted alphabetically, URL-encoded format)
        const paramString = buildPaymentParams(paymentParams);

        // Debug logging (remove in production or use proper logging service)
        console.log('Payment parameters object:', JSON.stringify(paymentParams, null, 2));
        console.log('Payment params string (before encryption):', paramString);
        console.log('PayerName value:', paymentParams.payerName);
        console.log('PayerName length:', paymentParams.payerName ? paymentParams.payerName.length : 0);

        // Encrypt using correct method (AES-GCM + HMAC-SHA-384)
        const encData = await encryptSabPaisaData(authKey, authIV, paramString);

        console.log('Encrypted data length:', encData.length);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', // Adjust CORS as needed
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: JSON.stringify({
                success: true,
                data: {
                    encData: encData, // Uppercase hex string
                    clientCode: clientCode,
                    paymentUrl: 'https://securepay.sabpaisa.in/SabPaisa/sabPaisaInit?v=1',
                    clientTxnId: clientTxnId
                }
            })
        };

    } catch (error) {
        console.error('SabPaisa encryption error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: error.message || 'Encryption failed',
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            })
        };
    }
};

// For local testing
if (require.main === module) {
    const testEvent = {
        body: JSON.stringify({
            amount: '100.00',
            payerName: 'John Doe',
            payerEmail: 'john@example.com',
            payerMobile: '9876543210',
            utilityId: 'electricity'
        })
    };

    exports.handler(testEvent)
        .then(result => {
            console.log('Test result:', JSON.parse(result.body));
        })
        .catch(err => {
            console.error('Test error:', err);
        });
}

