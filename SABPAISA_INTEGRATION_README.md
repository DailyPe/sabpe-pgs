# SabPaisa Payment Gateway Integration Guide

## Overview

This document provides complete instructions for integrating SabPaisa payment gateway into a Next.js application using AWS Lambda for payment initiation (static IP requirement).

## Architecture

```
User Browser → Next.js App → Lambda Function (Static IP) → SabPaisa Payment Gateway
                                    ↓
                            Encrypted Payment Data
                                    ↓
User → SabPaisa Payment Page → Success/Failure Pages → Firestore (Payment Records)
                                    ↓
                            Webhook Callback → Firestore
```

---

## 1. AWS Lambda Function Setup

### 1.1 Lambda Function Code

**File:** `lambda-sabpaisa-encrypt.js`

**Location:** Deploy this to AWS Lambda

**Runtime:** Node.js 18.x or higher (for Web Crypto API support)

**Handler:** `handler`

### 1.2 Lambda Environment Variables

Configure these in your Lambda function's environment variables:

```bash
SABPAISA_CLIENT_CODE=KBTO76
SABPAISA_TRANS_USER_NAME=your_transaction_username
SABPAISA_TRANS_USER_PASSWORD=your_transaction_password
SABPAISA_AUTH_KEY=base64_encoded_aes_key
SABPAISA_AUTH_IV=base64_encoded_aes_iv
SABPAISA_CHANNEL_ID=npm
SABPAISA_CALLBACK_URL=https://prod.sabpe.com/api/sabpaisa/return
```

### 1.3 Lambda Function Requirements

- **Runtime:** Node.js 18+ (for Web Crypto API)
- **Memory:** 256 MB minimum
- **Timeout:** 30 seconds
- **Static IP:** Required (configure VPC with NAT Gateway)
- **Handler:** `exports.handler`

### 1.4 Lambda API Gateway Endpoint

**Endpoint URL:**
```
https://sshykykxg4.execute-api.ap-south-1.amazonaws.com/prod/sabpaisa/initiate
```

**Method:** POST

**Content-Type:** application/json

**Request Body:**
```json
{
  "amount": "100.00",
  "payerName": "John Doe",
  "payerEmail": "john@example.com",
  "payerMobile": "9876543210",
  "utilityId": "electricity"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "encData": "A1B2C3D4E5F6...",
    "clientCode": "KBTO76",
    "paymentUrl": "https://securepay.sabpaisa.in/SabPaisa/sabPaisaInit?v=1",
    "clientTxnId": "SP_1765011492507"
  }
}
```

---

## 2. Encryption Method

### 2.1 Algorithm Details

- **Encryption:** AES-GCM (Galois/Counter Mode)
- **Key Size:** 256 bits
- **IV:** 12 bytes (randomly generated for each encryption)
- **Tag Length:** 128 bits
- **HMAC:** HMAC-SHA-384 for authentication
- **Output Format:** Uppercase hexadecimal string (NOT base64)

### 2.2 Encryption Process

1. Build parameter string: `key1=value1&key2=value2` (sorted alphabetically, URL-encoded)
2. Generate random 12-byte IV
3. Encrypt using AES-GCM with `authKey` and random IV
4. Sign encrypted data with HMAC-SHA-384 using `authIV` as HMAC key
5. Combine: `HMAC(48 bytes) + IV(12 bytes) + EncryptedData + Tag(16 bytes)`
6. Convert to uppercase hexadecimal string

### 2.3 Important Notes

- **DO NOT** use `authIV` as encryption IV (it's the HMAC key!)
- **DO NOT** output base64 (must be uppercase hex)
- **DO NOT** use AES-CBC (must be AES-GCM)
- IV must be randomly generated for each encryption

---

## 3. Next.js Application Setup

### 3.1 API Route: Payment Initiation

**File:** `app/api/sabpaisa/initiate/route.ts`

**Endpoint:** `POST /api/sabpaisa/initiate`

**Purpose:** Proxies payment request to Lambda function

**Request:**
```json
{
  "amount": "100.00",
  "payerName": "John Doe",
  "payerEmail": "john@example.com",
  "payerMobile": "9876543210",
  "utilityId": "electricity"
}
```

**Code:**
```typescript
import { NextRequest, NextResponse } from 'next/server';

const LAMBDA_ENDPOINT =
    process.env.SABPAISA_LAMBDA_ENDPOINT ||
    'https://sshykykxg4.execute-api.ap-south-1.amazonaws.com/prod/sabpaisa/initiate';

export async function POST(request: NextRequest) {
    const body = await request.json();
    const { amount, payerName, payerEmail, payerMobile, utilityId } = body;

    const callbackUrl = 'https://prod.sabpe.com/api/sabpaisa/return';

    const lambdaResponse = await fetch(LAMBDA_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            amount: amount.trim(),
            payerName: payerName.trim(),
            payerEmail: payerEmail.trim(),
            payerMobile: payerMobile.trim(),
            utilityId: utilityId || 'utility',
            callbackUrl: callbackUrl,
        }),
    });

    const lambdaData = await lambdaResponse.json();
    return NextResponse.json(lambdaData);
}
```

### 3.2 API Route: Return Handler

**File:** `app/api/sabpaisa/return/route.ts`

**Endpoint:** `GET/POST /api/sabpaisa/return`

**Purpose:** Receives encrypted response from SabPaisa, decrypts, saves to Firestore, redirects to result page

**Process:**
1. Receives `encResponse` or `ENCDATA` from SabPaisa
2. Decrypts using AES-GCM + HMAC-SHA-384
3. Parses decrypted data
4. Saves to Firestore
5. Redirects to `/payment/result?status=success|failure&orderId={orderId}`

### 3.3 API Route: Webhook Callback

**File:** `app/api/sabpaisa/callback/route.ts`

**Endpoint:** `POST /api/sabpaisa/callback`

**Purpose:** Receives JSON webhook from SabPaisa (server-to-server)

**Process:**
1. Receives encrypted response
2. Decrypts and saves to Firestore
3. Returns success response to SabPaisa

### 3.4 Success/Failure Pages

**Success Page:** `app/payment/success/page.tsx`
- URL: `https://prod.sabpe.com/payment/success`
- Displays success message with order ID

**Failure Page:** `app/payment/failure/page.tsx`
- URL: `https://prod.sabpe.com/payment/failure`
- Displays failure message with order ID

### 3.5 Client Component: Payment Form

**File:** `components/payment/sabpaisa-terminal-payment.tsx`

**Usage:**
```tsx
<SabPaisaTerminalPayment
    gatewayId="sabpaisa"
    utilityId="electricity"
    mode="prod"
/>
```

**Flow:**
1. User fills form (amount, payer name, email, mobile)
2. Calls `/api/sabpaisa/initiate`
3. Receives encrypted data from Lambda
4. Creates form and submits to SabPaisa payment URL
5. User redirected to SabPaisa payment page

---

## 4. SabPaisa Merchant Panel Configuration

### 4.1 URLs to Configure

**Success Page URL:**
```
https://prod.sabpe.com/payment/success
```

**Decline/Failure Page URL:**
```
https://prod.sabpe.com/payment/failure
```

**Webhook/Callback URL:**
```
https://prod.sabpe.com/api/sabpaisa/callback
```

**Return URL (in payment request):**
```
https://prod.sabpe.com/api/sabpaisa/return
```

### 4.2 URL Whitelisting

All URLs must be whitelisted in SabPaisa merchant panel:
- `https://prod.sabpe.com/payment/success`
- `https://prod.sabpe.com/payment/failure`
- `https://prod.sabpe.com/api/sabpaisa/callback`
- `https://prod.sabpe.com/api/sabpaisa/return`

**Note:** SabPaisa whitelists specific URLs, not domains. Each URL must be added separately.

---

## 5. Firestore Structure

### 5.1 Payment Documents

**Collection:** `payments`

**Document ID:** `{orderId}` (e.g., `SP_1765011492507`)

**Document Structure:**
```json
{
  "gateway": "sabpaisa",
  "status": "success" | "failure",
  "orderId": "SP_1765011492507",
  "encdata": "original_encrypted_hex_string",
  "decryptedRaw": "decrypted_string_before_parsing",
  "receivedAt": "timestamp",
  "clientTxnId": "SP_1765011492507",
  "amount": "100.00",
  "payerName": "John Doe",
  "payerEmail": "john@example.com",
  "payerMobile": "9876543210",
  "status": "SUCCESS",
  "STATUS": "SUCCESS",
  // ... all other parsed fields as top-level
  "raw": {
    // nested copy of all parsed fields
  }
}
```

---

## 6. Integration in Another Website

### 6.1 Step 1: Deploy Lambda Function

1. Create new Lambda function in AWS
2. Copy code from `lambda-sabpaisa-encrypt.js`
3. Set environment variables (credentials)
4. Configure static IP (VPC + NAT Gateway)
5. Create API Gateway endpoint
6. Note the Lambda endpoint URL

### 6.2 Step 2: Set Up Next.js API Routes

Copy these files to your Next.js app:

1. `app/api/sabpaisa/initiate/route.ts`
2. `app/api/sabpaisa/return/route.ts`
3. `app/api/sabpaisa/callback/route.ts`

Update the Lambda endpoint URL in `initiate/route.ts`:
```typescript
const LAMBDA_ENDPOINT = 'YOUR_LAMBDA_ENDPOINT_URL';
```

### 6.3 Step 3: Create Payment Pages

Copy these pages:
- `app/payment/success/page.tsx`
- `app/payment/failure/page.tsx`

Update domain in callback URLs:
```typescript
const callbackUrl = 'https://your-domain.com/api/sabpaisa/return';
```

### 6.4 Step 4: Create Payment Component

Copy `components/payment/sabpaisa-terminal-payment.tsx` to your app.

### 6.5 Step 5: Configure Environment Variables

**Next.js Environment Variables:**
```bash
SABPAISA_LAMBDA_ENDPOINT=https://your-lambda-endpoint.amazonaws.com/prod/sabpaisa/initiate
SABPAISA_AUTH_KEY=base64_encoded_key
SABPAISA_AUTH_IV=base64_encoded_iv
```

**Note:** Lambda function has its own environment variables (clientCode, transUserName, etc.)

### 6.6 Step 6: Configure SabPaisa Panel

1. Log in to SabPaisa merchant panel
2. Set Success Page: `https://your-domain.com/payment/success`
3. Set Decline Page: `https://your-domain.com/payment/failure`
4. Set Webhook URL: `https://your-domain.com/api/sabpaisa/callback`
5. Whitelist all URLs

### 6.7 Step 7: Test Integration

1. Navigate to payment page
2. Fill payment form
3. Submit payment
4. Verify redirect to SabPaisa
5. Complete test payment
6. Verify redirect to success/failure page
7. Check Firestore for payment record

---

## 7. Complete Lambda Function Code

See `lambda-sabpaisa-encrypt.js` for the complete implementation.

**Key Functions:**
- `encryptSabPaisaData()` - Encrypts payment data using AES-GCM + HMAC-SHA-384
- `buildPaymentParams()` - Builds URLSearchParams string (sorted alphabetically)
- `exports.handler` - Lambda handler function

---

## 8. Payment Flow

### 8.1 Initiation Flow

1. User fills payment form in browser
2. Form submits to `/api/sabpaisa/initiate`
3. Next.js API calls Lambda function
4. Lambda encrypts payment data (from static IP)
5. Lambda returns encrypted data + payment URL
6. Client creates form and submits to SabPaisa
7. User redirected to SabPaisa payment page

### 8.2 Return Flow

1. User completes payment on SabPaisa
2. SabPaisa redirects to `/api/sabpaisa/return?encResponse=...`
3. Return handler decrypts response
4. Saves to Firestore
5. Redirects to `/payment/success` or `/payment/failure`

### 8.3 Webhook Flow

1. SabPaisa sends JSON webhook to `/api/sabpaisa/callback`
2. Callback handler decrypts (if encrypted) or parses JSON
3. Saves to Firestore
4. Returns success to SabPaisa

---

## 9. Status Determination

### 9.1 Success Indicators

- `status` or `STATUS` contains: "SUCCESS", "COMPLETED", "APPROVED", "CAPTURED"
- `responseCode` or `RESPONSE_CODE` equals: "000"

### 9.2 Failure Indicators

- Any other status value
- Error messages in response
- Missing or invalid encrypted data

---

## 10. Error Handling

### 10.1 Common Errors

**"Payer name is not passed correctly"**
- Ensure `payerName` is not null/empty
- Check parameter string format

**"Merchant Url is not whitelisted"**
- Add exact callback URL to SabPaisa whitelist
- Check URL matches exactly (including https://, no trailing slash)

**"Problem in the payload. Please use proper encryption approach"**
- Verify encryption uses AES-GCM (not AES-CBC)
- Check output is uppercase hex (not base64)
- Ensure HMAC-SHA-384 is applied correctly

**Decryption failures**
- Verify `authKey` and `authIV` are correct base64 strings
- Check encrypted data format (uppercase hex)
- Ensure HMAC validation passes

---

## 11. Testing Checklist

- [ ] Lambda function deployed with correct environment variables
- [ ] Lambda has static IP configured
- [ ] Next.js API routes created
- [ ] Payment pages created (success/failure)
- [ ] SabPaisa panel configured with all URLs
- [ ] All URLs whitelisted in SabPaisa
- [ ] Test payment initiation
- [ ] Test payment completion (success)
- [ ] Test payment failure
- [ ] Verify Firestore records
- [ ] Test webhook callback

---

## 12. Required Credentials

### 12.1 From SabPaisa

1. **Client Code** - Merchant identifier (e.g., `KBTO76`)
2. **Transaction Username** - For authentication
3. **Transaction Password** - For authentication
4. **AES Encryption Key (authKey)** - Base64 format
5. **AES Initialization Vector (authIV)** - Base64 format (used as HMAC key)
6. **Channel ID** - Default: `npm`

### 12.2 Where to Store

**Lambda Environment Variables:**
- `SABPAISA_CLIENT_CODE`
- `SABPAISA_TRANS_USER_NAME`
- `SABPAISA_TRANS_USER_PASSWORD`
- `SABPAISA_AUTH_KEY`
- `SABPAISA_AUTH_IV`
- `SABPAISA_CHANNEL_ID`

**Next.js Environment Variables (for callback decryption):**
- `SABPAISA_AUTH_KEY`
- `SABPAISA_AUTH_IV`

---

## 13. Code Files Reference

### 13.1 Lambda Function
- `lambda-sabpaisa-encrypt.js` - Complete Lambda function code

### 13.2 Next.js API Routes
- `app/api/sabpaisa/initiate/route.ts` - Payment initiation
- `app/api/sabpaisa/return/route.ts` - Return handler (decrypt + redirect)
- `app/api/sabpaisa/callback/route.ts` - Webhook handler

### 13.3 Pages
- `app/payment/success/page.tsx` - Success page
- `app/payment/failure/page.tsx` - Failure page

### 13.4 Components
- `components/payment/sabpaisa-terminal-payment.tsx` - Payment form component

---

## 14. Quick Setup for New Terminal/Website

### 14.1 Lambda Setup

1. Create new Lambda function
2. Copy `lambda-sabpaisa-encrypt.js` code
3. Set environment variables with new terminal credentials
4. Configure static IP (VPC + NAT Gateway)
5. Create API Gateway endpoint
6. Note endpoint URL

### 14.2 Next.js Setup

1. Copy API routes to `app/api/sabpaisa/`
2. Update Lambda endpoint in `initiate/route.ts`
3. Update callback URLs to your domain
4. Copy payment pages
5. Copy payment component
6. Set environment variables

### 14.3 SabPaisa Configuration

1. Get terminal credentials from SabPaisa
2. Configure URLs in merchant panel:
   - Success: `https://your-domain.com/payment/success`
   - Failure: `https://your-domain.com/payment/failure`
   - Webhook: `https://your-domain.com/api/sabpaisa/callback`
3. Whitelist all URLs

### 14.4 Test

1. Make test payment
2. Verify redirects work
3. Check Firestore records
4. Verify webhook received

---

## 15. Troubleshooting

### 15.1 Payment Not Initiating

- Check Lambda endpoint is accessible
- Verify Lambda environment variables are set
- Check Lambda logs for errors
- Verify encryption is working (check logs)

### 15.2 Redirect Not Working

- Verify URLs are whitelisted in SabPaisa
- Check callback URL matches exactly
- Verify domain is correct

### 15.3 Decryption Failing

- Verify `authKey` and `authIV` are correct
- Check encrypted data format (uppercase hex)
- Verify HMAC validation
- Check Lambda logs for encryption errors

### 15.4 Firestore Not Saving

- Check Firebase configuration
- Verify Firestore permissions
- Check for errors in logs
- Verify collection name is `payments`

---

## 16. Security Notes

1. **Never expose credentials in client-side code**
2. **All encryption happens in Lambda (server-side)**
3. **Use HTTPS for all endpoints**
4. **Validate and sanitize all input**
5. **Store credentials in environment variables only**
6. **Use static IP for Lambda (required by SabPaisa)**
7. **Implement rate limiting on API endpoints**
8. **Log all transactions for audit**

---

## 17. Support

For issues or questions:
1. Check Lambda CloudWatch logs
2. Check Next.js server logs
3. Verify SabPaisa merchant panel configuration
4. Test with SabPaisa test credentials first
5. Contact SabPaisa support for gateway-specific issues

---

## 18. Example: Complete Integration

See the codebase for complete working implementation:
- Lambda function: `lambda-sabpaisa-encrypt.js`
- API routes: `app/api/sabpaisa/*`
- Pages: `app/payment/success/page.tsx`, `app/payment/failure/page.tsx`
- Component: `components/payment/sabpaisa-terminal-payment.tsx`

All code is production-ready and can be copied to another website/terminal with appropriate credential updates.

