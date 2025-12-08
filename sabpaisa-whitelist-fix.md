# SabPaisa "Merchant Url is not whitelisted" Error - Fix Guide

## What SabPaisa is Checking

**SabPaisa checks the CALLBACK URL, NOT the IP address.**

When you send a payment request, SabPaisa validates that the `callbackUrl` parameter in your encrypted payload matches one of the URLs whitelisted in your SabPaisa merchant panel.

---

## What URL is Being Sent?

The callback URL is built from:
1. **Request origin** (from your Next.js app)
2. **Environment variable** `SABPAISA_CALLBACK_URL` (if set in Lambda)
3. **Default fallback** (if neither above is available)

**Format:** `https://YOUR_DOMAIN/payment/result`

**Example:**
- Production: `https://yourdomain.com/payment/result`
- Development: `http://localhost:3000/payment/result` (won't work - must be HTTPS in production)

---

## How to Check What URL is Being Sent

### Option 1: Check Lambda Logs
The Lambda function now logs the callback URL:
```
Callback URL being sent to SabPaisa: https://your-domain.com/payment/result
```

### Option 2: Check Payment Parameters Log
The Lambda also logs the full payment parameters object before encryption, which includes the `callbackUrl`.

---

## How to Fix: Whitelist Your URL in SabPaisa

### Step 1: Log in to SabPaisa Merchant Panel
1. Go to your SabPaisa merchant dashboard
2. Navigate to **Settings** or **Configuration**
3. Look for **"Whitelisted URLs"**, **"Callback URLs"**, or **"Return URLs"** section

### Step 2: Add Your Callback URL
Add the **exact URL** that your Lambda is sending:

**Production URL:**
```
https://your-production-domain.com/payment/result
```

**Important:**
- Must match **exactly** (including `https://`, no trailing slash)
- Must be **HTTPS** (not HTTP) for production
- Include the full path: `/payment/result`

### Step 3: Common URL Formats to Whitelist

If you have multiple environments, whitelist all of them:

```
https://yourdomain.com/payment/result
https://www.yourdomain.com/payment/result
https://app.yourdomain.com/payment/result
```

**Note:** Don't include query parameters or trailing slashes in the whitelist.

---

## How to Set the Callback URL

### Option 1: Use Environment Variable (Recommended for Production)

In your **Lambda environment variables**, set:
```bash
SABPAISA_CALLBACK_URL=https://your-production-domain.com/payment/result
```

This ensures a consistent callback URL regardless of where the request comes from.

### Option 2: Use Next.js Environment Variable

In your **Next.js environment variables** (`.env.local` or production env):
```bash
NEXT_PUBLIC_APP_ORIGIN=https://your-production-domain.com
```

The code will automatically append `/payment/result` to this.

### Option 3: Dynamic from Request (Current Implementation)

The current code automatically detects the origin from the request and builds:
```
{origin}/payment/result
```

**This is fine for development but may cause issues if:**
- The request comes from different domains
- You're using a CDN/proxy that changes the origin header

---

## Verification Steps

1. **Check Lambda logs** to see what callback URL is being sent
2. **Verify in SabPaisa panel** that this exact URL is whitelisted
3. **Test payment** - the error should be resolved

---

## Common Issues

### Issue 1: URL Mismatch
**Problem:** The URL in your request doesn't match the whitelisted URL exactly.

**Solution:** 
- Check Lambda logs for the exact URL being sent
- Ensure it matches exactly in SabPaisa panel (case-sensitive, no trailing slash)

### Issue 2: HTTP vs HTTPS
**Problem:** Using HTTP in production (SabPaisa requires HTTPS).

**Solution:**
- Always use HTTPS for production callback URLs
- Update your environment variable to use `https://`

### Issue 3: Trailing Slash
**Problem:** URL has trailing slash in request but not in whitelist (or vice versa).

**Solution:**
- The code automatically removes trailing slashes
- Ensure whitelist doesn't have trailing slash: `https://domain.com/payment/result` (not `/payment/result/`)

### Issue 4: Different Environments
**Problem:** Development and production use different URLs.

**Solution:**
- Whitelist both URLs in SabPaisa panel
- Or use environment-specific Lambda environment variables

---

## Quick Fix Checklist

- [ ] Check Lambda logs to see what callback URL is being sent
- [ ] Log in to SabPaisa merchant panel
- [ ] Find "Whitelisted URLs" or "Callback URLs" section
- [ ] Add the exact URL from Lambda logs (including `https://` and full path)
- [ ] Save changes in SabPaisa panel
- [ ] Test payment again
- [ ] If still failing, verify URL matches exactly (no extra spaces, correct case)

---

## Example: What to Whitelist

If your Lambda logs show:
```
Callback URL being sent to SabPaisa: https://sabpe.com/payment/result
```

Then in SabPaisa merchant panel, whitelist:
```
https://sabpe.com/payment/result
```

**Exact match required!**

