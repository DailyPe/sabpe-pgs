import Link from 'next/link';

interface SearchParams {
    [key: string]: string | string[] | undefined;
}

export default async function PaymentSuccessPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const params = await searchParams;
    const orderId = params.orderId as string | undefined;

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950/70 p-8 text-center shadow-xl">
                <div className="mb-6">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
                        <svg
                            className="h-8 w-8 text-green-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                            />
                        </svg>
                    </div>
                </div>

                <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
                    Payment Successful
                </h1>
                <p className="mt-2 text-sm text-slate-400">
                    Your payment has been processed successfully.
                </p>

                {orderId && (
                    <p className="mt-4 text-xs font-mono text-slate-400">
                        Order ID: <span className="text-slate-200">{orderId}</span>
                    </p>
                )}

                <div className="mt-8">
                    <Link
                        href="/"
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        Back to dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
}

