# SabPaisa Lambda Encryption Implementation Guide

## Problem
SabPaisa is rejecting the encrypted payload because the encryption method doesn't match their requirements.

## Correct Encryption Method

SabPaisa uses **AES-GCM with HMAC-SHA-384**, not AES-CBC. The output must be an **uppercase hexadecimal string**, not base64.

---

## Encryption Algorithm Details

### 1. Algorithm: AES-GCM
- **Mode:** AES-GCM (Galois/Counter Mode)
- **Key Size:** 256 bits (from `authKey` base64-decoded)
- **IV Size:** 12 bytes (randomly generated, NOT from `authIV`)
- **Tag Length:** 128 bits

### 2. HMAC Authentication
- **Algorithm:** HMAC-SHA-384
- **Key:** `authIV` (base64-decoded, used as HMAC key, NOT as encryption IV)
- **Purpose:** Signs the encrypted data for integrity

### 3. Output Format
- **Format:** Uppercase hexadecimal string
- **Structure:** `HMAC(48 bytes) + IV(12 bytes) + EncryptedData + Tag(16 bytes)`
- **Total minimum length:** 76 bytes (152 hex characters)

---

## Lambda Function Implementation (Node.js)

```javascript
const crypto = require('crypto');

/**
 * Convert base64 string to Uint8Array
 */
function base64ToUint8Array(base64) {
    return Uint8Array.from(Buffer.from(base64, 'base64'));
}

/**
 * Encrypt SabPaisa payment data
 * @param {string} authKey - Base64 encoded AES key
 * @param {string} authIV - Base64 encoded HMAC key (NOT encryption IV!)
 * @param {string} plaintext - Payment parameters as URLSearchParams string
 * @returns {Promise<string>} Uppercase hexadecimal encrypted string
 */
async function encryptSabPaisaData(authKey, authIV, plaintext) {
    // Decode keys from base64
    const encryptionKey = base64ToUint8Array(authKey);
    const hmacKey = base64ToUint8Array(authIV);
    
    // Generate random 12-byte IV for AES-GCM
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
            tagLength: 128
        },
        cryptoKey,
        new TextEncoder().encode(plaintext)
    );
    
    // Combine IV and encrypted data
    const encryptedArray = new Uint8Array(encrypted);
    const ivAndData = new Uint8Array(iv.length + encryptedArray.length);
    ivAndData.set(iv, 0);
    ivAndData.set(encryptedArray, iv.length);
    
    // Import HMAC key
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
 * Build payment parameters string
 */
function buildPaymentParams(params) {
    // Sort keys alphabetically
    const sortedKeys = Object.keys(params).sort();
    
    // Build key=value pairs joined with ~
    return sortedKeys
        .map(key => `${key}=${params[key]}`)
        .join('~');
}

/**
 * Lambda handler
 */
exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body);
        const {
            amount,
            payerName,
            payerEmail,
            payerMobile,
            utilityId
        } = body;
        
        // Validate required fields
        if (!amount || !payerName || !payerEmail || !payerMobile) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: 'Missing required fields'
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
                body: JSON.stringify({
                    success: false,
                    error: 'SabPaisa credentials not configured'
                })
            };
        }
        
        // Generate client transaction ID
        const clientTxnId = `SP_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        
        // Build callback URL (from event or environment)
        const callbackUrl = process.env.SABPAISA_CALLBACK_URL || 
            `https://your-domain.com/payment/result`;
        
        // Build payment parameters (sorted alphabetically)
        const paymentParams = {
            amount: amount.trim(),
            callbackUrl: callbackUrl,
            channelId: channelId,
            clientCode: clientCode,
            clientTxnId: clientTxnId,
            payerEmail: payerEmail.trim(),
            payerMobile: payerMobile.trim(),
            payerName: payerName.trim(),
            transUserName: transUserName,
            transUserPassword: transUserPassword
        };
        
        // Build parameter string
        const paramString = buildPaymentParams(paymentParams);
        
        // Encrypt using correct method
        const encData = await encryptSabPaisaData(authKey, authIV, paramString);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                data: {
                    encData: encData,
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
            body: JSON.stringify({
                success: false,
                error: error.message || 'Encryption failed'
            })
        };
    }
};
```

---

## Key Points for Lambda Implementation

### 1. Use Web Crypto API (crypto.subtle)
- Node.js 18+ has full Web Crypto API support
- Use `crypto.subtle.importKey()` and `crypto.subtle.encrypt()`
- NOT the older `crypto.createCipheriv()` (that's for AES-CBC)

### 2. IV Generation
- Generate a **random 12-byte IV** for each encryption
- Do NOT use `authIV` as the encryption IV
- `authIV` is used as the HMAC key

### 3. Parameter String Format
- Sort keys **alphabetically**
- Format: `key1=value1~key2=value2~...`
- Use `~` (tilde) as separator, NOT `&`

### 4. Output Format
- Convert final byte array to **uppercase hexadecimal**
- NOT base64
- Example: `"A1B2C3D4..."` not `"abcd1234=="`

### 5. HMAC Placement
- HMAC signature comes **first** (48 bytes)
- Then IV (12 bytes)
- Then encrypted data + tag (variable length)

---

## Testing

Test with this payload:
```json
{
  "amount": "100.00",
  "payerName": "John Doe",
  "payerEmail": "john@example.com",
  "payerMobile": "9876543210",
  "utilityId": "electricity"
}
```

Expected response format:
```json
{
  "success": true,
  "data": {
    "encData": "A1B2C3D4E5F6...",  // Uppercase hex, NOT base64
    "clientCode": "KBTO76",
    "paymentUrl": "https://securepay.sabpaisa.in/SabPaisa/sabPaisaInit?v=1",
    "clientTxnId": "SP_1234567890_ABC123"
  }
}
```

---

## Common Mistakes to Avoid

1. ❌ Using AES-CBC instead of AES-GCM
2. ❌ Using `authIV` as encryption IV (it's the HMAC key!)
3. ❌ Outputting base64 instead of uppercase hex
4. ❌ Not generating random IV for each encryption
5. ❌ Not applying HMAC-SHA-384 signature
6. ❌ Wrong parameter string format (must be sorted, use `~` separator)

---

## Lambda Environment Variables Required

```bash
SABPAISA_CLIENT_CODE=KBTO76
SABPAISA_TRANS_USER_NAME=your_username
SABPAISA_TRANS_USER_PASSWORD=your_password
SABPAISA_AUTH_KEY=base64_encoded_key
SABPAISA_AUTH_IV=base64_encoded_iv
SABPAISA_CHANNEL_ID=npm
SABPAISA_CALLBACK_URL=https://your-domain.com/payment/result
```

---

## Node.js Version Requirement

- **Minimum:** Node.js 18+ (for full Web Crypto API support)
- **Recommended:** Node.js 20 LTS

If using older Node.js, you may need to use the `crypto` module differently or use a polyfill.

