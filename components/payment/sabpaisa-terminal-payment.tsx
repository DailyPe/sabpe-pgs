'use client';

import { useState } from 'react';

import { Card } from '../ui/card';
import { Button } from '../ui/button';

interface SabPaisaTerminalPaymentProps {
    gatewayId: string;
    utilityId: string;
    mode: 'uat' | 'prod';
}

export function SabPaisaTerminalPayment({
    gatewayId,
    utilityId,
    mode,
}: SabPaisaTerminalPaymentProps) {
    const [error, setError] = useState<string | null>(null);

    const [amount, setAmount] = useState<string>('');
    const [payerName, setPayerName] = useState<string>('');
    const [payerEmail, setPayerEmail] = useState<string>('');
    const [payerMobile, setPayerMobile] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        const amountString = amount.trim();

        const amountPattern = /^\d+(\.\d{1,2})?$/;
        if (!amountPattern.test(amountString)) {
            setError('Please enter a valid amount (up to 2 decimal places).');
            return;
        }

        const numericAmount = Number(amountString);
        if (!numericAmount || numericAmount < 10) {
            setError('Minimum payment amount is ₹10.');
            return;
        }

        if (!payerName.trim() || !payerEmail.trim() || !payerMobile.trim()) {
            setError('Please fill in payer name, email, and mobile.');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            // Call server-side API to initiate payment (encryption happens on server)
            const response = await fetch('/api/sabpaisa/initiate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: amountString,
                    payerName: payerName.trim(),
                    payerEmail: payerEmail.trim(),
                    payerMobile: payerMobile.trim(),
                    utilityId,
                }),
            });

            const json = await response.json().catch(() => ({}));

            if (!response.ok || !json.success) {
                setError(
                    json.error ??
                    'Failed to initiate SabPaisa payment. Please try again.',
                );
                setSubmitting(false);
                return;
            }

            const { encData, clientCode, paymentUrl } = json.data;

            // Create and submit form to SabPaisa
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = paymentUrl;
            form.target = '_blank';

            const encDataInput = document.createElement('input');
            encDataInput.type = 'hidden';
            encDataInput.name = 'encData';
            encDataInput.value = encData;
            form.appendChild(encDataInput);

            const clientCodeInput = document.createElement('input');
            clientCodeInput.type = 'hidden';
            clientCodeInput.name = 'clientCode';
            clientCodeInput.value = clientCode;
            form.appendChild(clientCodeInput);

            document.body.appendChild(form);
            form.submit();
            document.body.removeChild(form);
        } catch (err) {
            console.error('Failed to initiate SabPaisa payment', err);
            setError('Failed to initiate payment. Please try again.');
            setSubmitting(false);
        }
    };

    return (
        <Card className="max-w-xl">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
                SabPaisa Payment
            </h2>

            {error && (
                <p className="mt-4 text-sm text-red-500" aria-live="polite">
                    {error}
                </p>
            )}

            {!error && (
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <div>
                        <label
                            htmlFor="sabpaisa-amount"
                            className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                        >
                            Amount (INR)
                        </label>
                        <input
                            id="sabpaisa-amount"
                            type="number"
                            min={10}
                            step="0.01"
                            required
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label
                                htmlFor="sabpaisa-name"
                                className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                            >
                                Payer name
                            </label>
                            <input
                                id="sabpaisa-name"
                                type="text"
                                required
                                value={payerName}
                                onChange={(event) => setPayerName(event.target.value)}
                                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="sabpaisa-email"
                                className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                            >
                                Payer email
                            </label>
                            <input
                                id="sabpaisa-email"
                                type="email"
                                required
                                value={payerEmail}
                                onChange={(event) => setPayerEmail(event.target.value)}
                                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
                            />
                        </div>
                    </div>

                    <div>
                        <label
                            htmlFor="sabpaisa-mobile"
                            className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                        >
                            Payer mobile
                        </label>
                        <input
                            id="sabpaisa-mobile"
                            type="tel"
                            required
                            value={payerMobile}
                            onChange={(event) => setPayerMobile(event.target.value)}
                            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
                        />
                    </div>

                    <div className="pt-2">
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Preparing payment…' : 'Pay with SabPaisa'}
                        </Button>
                    </div>
                </form>
            )}

        </Card>
    );
}



