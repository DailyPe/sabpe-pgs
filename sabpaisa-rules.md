# SabPaisa Integration Rules & Requirements

## Overview
This document outlines all required elements, configurations, and API endpoints needed for SabPaisa payment gateway integration with static IP support via Lambda functions.

---

## 1. Lambda Function Configuration

### Lambda Endpoint

Payment initiation is handled by an AWS Lambda function with static IP:

**Lambda Endpoint:**
```
https://sshykykxg4.execute-api.ap-south-1.amazonaws.com/prod/sabpaisa/initiate
```

**Environment Variable (Optional):**
```bash
SABPAISA_LAMBDA_ENDPOINT=https://sshykykxg4.execute-api.ap-south-1.amazonaws.com/prod/sabpaisa/initiate
```

**Note:** If `SABPAISA_LAMBDA_ENDPOINT` is not set, the default Lambda endpoint above will be used.

**Lambda Function Requirements:**
- All SabPaisa credentials (clientCode, transUserName, transUserPassword, authKey, authIV) are stored in Lambda environment variables
- Lambda handles encryption and payment initiation from a static IP
- Lambda returns encrypted payment data ready for form submission

---

## 2. Required API Endpoints

### 2.1 Payment Initiation API (Proxies to Lambda with Static IP)
**Endpoint:** `POST /api/sabpaisa/initiate`

**Purpose:** Proxy payment initiation request to AWS Lambda function (encryption happens in Lambda with static IP)

**Request Body:**
```json
{
  "amount": "100.00",
  "payerName": "John Doe",
  "payerEmail": "john@example.com",
  "payerMobile": "9876543210",
  "utilityId": "utility"  // optional, for tracking
}
```

**Process:**
1. Validate required fields (amount, payerName, payerEmail, payerMobile)
2. Forward request to Lambda function: `https://sshykykxg4.execute-api.ap-south-1.amazonaws.com/prod/sabpaisa/initiate`
3. Lambda handles:
   - Reading credentials from Lambda environment variables
   - Generating client transaction ID
   - Building and encrypting payment parameters (AES-256-CBC)
   - Returning encrypted data + payment URL
4. Return Lambda response to client

**Response:**
```json
{
  "success": true,
  "data": {
    "encData": "BASE64_ENCRYPTED_STRING",
    "clientCode": "YOUR_CLIENT_CODE",
    "paymentUrl": "https://securepay.sabpaisa.in/SabPaisa/sabPaisaInit?v=1",
    "clientTxnId": "SP_1765011492507"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message"
}
```

---

### 2.2 Payment Callback Handler
**Endpoint:** `POST /api/sabpaisa/callback`

**Purpose:** Receive and process encrypted callback from SabPaisa

**Request:**
- Content-Type: `application/x-www-form-urlencoded` or `application/json`
- Contains encrypted response data (`encResponse` or `ENCDATA`)

**Process:**
1. Extract encrypted response from request
2. Look up terminal config using `clientCode` or transaction ID
3. Decrypt response using `authKey` and `authIV`
4. Parse decrypted data (key=value~ format or JSON)
5. Save all fields to Firestore: `payments/{orderId}`
6. Determine payment status (success/failure)
7. Redirect user to `/payment/result?status=success|failure&orderId={orderId}`

**Firestore Document Structure:**
```json
{
  "gateway": "sabpaisa",
  "status": "success" | "failure",
  "orderId": "SP_ABC123",
  "encdata": "original_encrypted_string",
  "decryptedRaw": "decrypted_string_before_parsing",
  "receivedAt": "timestamp",
  // All parsed fields as top-level:
  "CLIENT_TXN_ID": "...",
  "AMOUNT": "...",
  "STATUS": "...",
  // ... all other fields
  "raw": { /* full parsed object */ }
}
```

---

### 2.3 Payment Status Check (Optional)
**Endpoint:** `GET /api/sabpaisa/status/:transactionId`

**Purpose:** Verify payment status server-side

**Process:**
1. Call SabPaisa status API with transaction ID
2. Decrypt response if needed
3. Return current payment status

---

## 3. Encryption Requirements

### AES Encryption Algorithm
- **Algorithm:** AES-256-CBC (or as specified by SabPaisa)
- **Key:** `authKey` (base64-decoded)
- **IV:** `authIV` (base64-decoded)
- **Encoding:** Base64 for encrypted output

### Encryption Process (Payment Initiation)
1. Build parameter string: `key1=value1~key2=value2~...`
2. Sort keys alphabetically
3. Encrypt using AES with `authKey` and `authIV`
4. Base64 encode encrypted result
5. Send as `encData` to SabPaisa

### Decryption Process (Callback)
1. Receive `encResponse` or `ENCDATA` from SabPaisa
2. Base64 decode
3. Decrypt using AES with `authKey` and `authIV`
4. Parse decrypted string (key=value~ format or JSON)
5. Extract all fields

---

## 4. Callback URLs Configuration

### In SabPaisa Merchant Panel:
- **Return URL / Success URL:** `https://YOUR_DOMAIN/payment/result`
- **Callback URL / Webhook URL:** `https://YOUR_DOMAIN/api/sabpaisa/callback`

**Note:** Replace `YOUR_DOMAIN` with your production domain.

---

## 5. Payment Flow

### Current Flow (Client-Side Initiation)
1. User fills payment form in UI
2. Client calls `submitPaymentForm()` from `sabpaisa-pg-dev`
3. Client encrypts and POSTs to SabPaisa
4. User redirected to SabPaisa payment page
5. After payment, SabPaisa redirects to `/payment/result`
6. SabPaisa sends callback to `/api/sabpaisa/callback`

### Recommended Flow (Lambda Initiation - Static IP)
1. User fills payment form in UI
2. Client calls `POST /api/sabpaisa/initiate` (Next.js API route)
3. Next.js API route calls Lambda function
4. Lambda encrypts and POSTs to SabPaisa (from static IP)
5. Lambda returns redirect URL to Next.js
6. Next.js returns redirect URL to client
7. Client redirects user to SabPaisa payment page
8. After payment, SabPaisa redirects to `/payment/result`
9. SabPaisa sends callback to `/api/sabpaisa/callback` (Lambda)

---

## 6. Lambda Function Requirements

### Payment Initiation Lambda
- **Runtime:** Node.js (latest LTS)
- **Handler:** Encrypts payment params and calls SabPaisa API
- **Input:** Payment parameters (amount, customer details, etc.)
- **Output:** Redirect URL or payment form data
- **Static IP:** Required (use VPC or NAT Gateway)
- **Timeout:** 30 seconds
- **Memory:** 256 MB minimum

### Callback Handler Lambda
- **Runtime:** Node.js (latest LTS)
- **Handler:** Decrypts callback and saves to Firestore
- **Input:** Encrypted callback from SabPaisa
- **Output:** Success response to SabPaisa
- **Static IP:** Not required (incoming webhook)
- **Timeout:** 10 seconds
- **Memory:** 256 MB minimum

---

## 7. Environment Variables (Lambda)

### Required Variables:
```
SABPAISA_API_BASE=https://securepay.sabpaisa.in
FIREBASE_PROJECT_ID=sabpepgs
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...
```

---

## 8. Status Mapping

### Success Status Indicators:
- `STATUS` contains: "SUCCESS", "COMPLETED", "APPROVED", "CAPTURED"
- `RESPONSE_CODE` equals: "000"
- `RESPONSE_MESSAGE` contains: "success", "captur"

### Failure Status Indicators:
- Any other status value
- `RESPONSE_CODE` not equal to "000"
- Error messages in response

---

## 9. Required Credentials from SabPaisa

1. **Client Code** - Merchant identifier
2. **Transaction Username** - For authentication
3. **Transaction Password** - For authentication
4. **AES Encryption Key (authKey)** - Base64 format
5. **AES Initialization Vector (authIV)** - Base64 format
6. **Channel ID** - Default: "npm"
7. **Payment URL** - Production: `https://securepay.sabpaisa.in/SabPaisa/sabPaisaInit?v=1`

---

## 10. Testing Checklist

- [ ] All environment variables are set correctly
- [ ] Payment initiation API encrypts correctly
- [ ] Payment initiation happens from server-side (static IP)
- [ ] Client receives encrypted data and submits form successfully
- [ ] Callback handler decrypts response correctly (if implemented)
- [ ] All callback fields saved to Firestore (if callback implemented)
- [ ] Status determination works (success/failure)
- [ ] User redirected correctly after payment
- [ ] Error handling for missing/invalid credentials
- [ ] Error handling for encryption/decryption failures

---

## 11. Security Considerations

1. **Never expose credentials in client-side code**
2. **Store all sensitive data in environment variables (server-side only)**
3. **Payment initiation happens server-side (static IP from Next.js server/Lambda)**
4. **Validate and sanitize all input parameters**
5. **Implement rate limiting on API endpoints**
6. **Log all payment transactions for audit**
7. **Use HTTPS for all API endpoints**
8. **Implement proper error handling without exposing internals**

---

## 12. Current Implementation Status

- ✅ Lambda function for payment initiation (with static IP)
- ✅ Next.js API route that proxies to Lambda (`/api/sabpaisa/initiate`)
- ✅ Client-side payment form component (calls Next.js API)
- ✅ Payment result page
- ⚠️ Callback handler (needs implementation for webhook processing)
- ⚠️ Status verification (optional, not implemented)

---

## 13. Setup Instructions

1. **Lambda Function Configuration:**
   - Ensure Lambda function is deployed with all SabPaisa credentials in Lambda environment variables
   - Lambda endpoint: `https://sshykykxg4.execute-api.ap-south-1.amazonaws.com/prod/sabpaisa/initiate`
   - Lambda should have static IP configured (VPC/NAT Gateway)

2. **Next.js Environment Variables (Optional):**
   - Only needed if you want to override the default Lambda endpoint:
   ```bash
   SABPAISA_LAMBDA_ENDPOINT=https://sshykykxg4.execute-api.ap-south-1.amazonaws.com/prod/sabpaisa/initiate
   ```

3. **Test payment initiation:**
   - Navigate to `/sabpaisa/{utility}` in your app
   - Fill in payment form
   - Payment request goes to Next.js API → Lambda (with static IP) → SabPaisa
   - Client receives encrypted data and redirects to SabPaisa payment page

4. **Configure callback URL in SabPaisa panel:**
   - Set return URL: `https://YOUR_DOMAIN/payment/result`
   - Set callback/webhook URL: `https://YOUR_DOMAIN/api/sabpaisa/callback` (if implementing callback handler)


