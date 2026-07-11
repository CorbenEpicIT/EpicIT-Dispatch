import { QRCodeSVG } from "qrcode.react";
import {
    useMfaStatusQuery,
    useSetupMfaMutation,
    useDisableMfaMutation,
    useEnableMfaMutation,
} from "../../hooks/useMfa";
import { Shield, ShieldCheck, Copy, Check, Loader2, Download, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { SixDigitInput } from "../ui/forms/SixDigitInput";

const primaryBtn =
    "inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
    "inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50";
const dangerBtn =
    "inline-flex items-center justify-center gap-1.5 rounded-md bg-error px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-error-strong disabled:cursor-not-allowed disabled:opacity-50";

export default function MFACard() {
    const [copied, setCopied] = useState(false);
    const [codesCopied, setCodesCopied] = useState(false);
    const [codesAcknowledged, setCodesAcknowledged] = useState(false);
    const [disable, setDisable] = useState(false);
    const [disableCode, setDisableCode] = useState("");
    const [sixDigitVal, setSixDigitVal] = useState(["", "", "", "", "", ""]);
    const setupMFa = useSetupMfaMutation();
    const enableMfa = useEnableMfaMutation();
    const disableMfa = useDisableMfaMutation();
    const { data: queryData, isLoading: statusLoading } = useMfaStatusQuery();

    const copySecret = () => {
        if (!setupMFa.data) return;
        navigator.clipboard.writeText(setupMFa.data.secret);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const backupCodes = enableMfa.data?.backupCodes ?? null;
    const showBackupCodes = !!backupCodes && !codesAcknowledged;

    const submitEnable = (code: string) => {
        if (enableMfa.isPending) return;
        enableMfa.mutate(code);
    };

    const copyCodes = () => {
        if (!backupCodes) return;
        navigator.clipboard.writeText(backupCodes.join("\n"));
        setCodesCopied(true);
        setTimeout(() => setCodesCopied(false), 2000);
    };

    const downloadCodes = () => {
        if (!backupCodes) return;
        const blob = new Blob(
            [`EpicIT-Dispatch — two-factor backup codes\n\n${backupCodes.join("\n")}\n`],
            { type: "text/plain" }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "mfa-backup-codes.txt";
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="rounded-lg border border-border-card bg-surface p-6">
            {/* Header */}
            <div className="mb-5 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-bg text-primary">
                    <Shield size={20} />
                </div>
                <div>
                    <h2 className="text-base font-semibold text-text-primary">
                        Two-factor authentication
                    </h2>
                    <p className="text-sm text-text-muted">
                        Require a rotating code from an authenticator app at sign-in.
                    </p>
                </div>
            </div>

            {statusLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-text-muted">
                    <Loader2 size={16} className="animate-spin" />
                    Loading&hellip;
                </div>
            ) : showBackupCodes ? (
                /* ── Backup codes (shown once, right after enable) ──────── */
                <div className="space-y-4">
                    <div className="flex items-start gap-2 rounded-md border border-warning-border bg-warning-bg px-4 py-3">
                        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
                        <div>
                            <p className="text-sm font-medium text-warning-text">
                                Save your backup codes
                            </p>
                            <p className="text-xs text-text-muted">
                                Each code works once if you lose your authenticator. This
                                is the only time they&rsquo;re shown &mdash; store them
                                somewhere safe.
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 rounded-md border border-border-subtle bg-surface-inset p-4 font-mono text-sm text-text-primary">
                        {backupCodes!.map((c) => (
                            <span key={c} className="tracking-wider">{c}</span>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button className={secondaryBtn} onClick={copyCodes}>
                            {codesCopied ? (
                                <Check size={14} className="text-success" />
                            ) : (
                                <Copy size={14} />
                            )}
                            {codesCopied ? "Copied" : "Copy"}
                        </button>
                        <button className={secondaryBtn} onClick={downloadCodes}>
                            <Download size={14} /> Download
                        </button>
                        <button
                            className={primaryBtn}
                            onClick={() => {
                                setCodesAcknowledged(true);
                                setupMFa.reset();
                                setSixDigitVal(["", "", "", "", "", ""]);
                            }}
                        >
                            I&rsquo;ve saved my codes
                        </button>
                    </div>
                </div>
            ) : !queryData?.enabled ? (
                !setupMFa.data ? (
                    /* ── Idle: not enrolled ─────────────────────────────── */
                    <div className="space-y-4">
                        <p className="text-sm text-text-secondary">
                            Works with Microsoft Authenticator, Okta Verify, Google
                            Authenticator, Authy, and 1Password.
                        </p>
                        <button
                            className={primaryBtn}
                            disabled={setupMFa.isPending}
                            onClick={() => setupMFa.mutate()}
                        >
                            {setupMFa.isPending && (
                                <Loader2 size={14} className="animate-spin" />
                            )}
                            Set up authenticator app
                        </button>
                    </div>
                ) : (
                    /* ── Setup: scan QR + enter code ────────────────────── */
                    <div className="space-y-6">
                        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                            <div className="w-fit rounded-lg border border-border-card bg-white p-3 shadow-sm">
                                <QRCodeSVG value={setupMFa.data.otpAuthUri} size={160} />
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                                <h3 className="text-sm font-semibold text-text-primary">
                                    Scan the QR code
                                </h3>
                                <p className="text-sm text-text-muted">
                                    Open your authenticator app and scan the code, or
                                    enter the setup key manually.
                                </p>
                                <div className="space-y-1.5 pt-1">
                                    <p className="text-xs font-medium text-text-tertiary">
                                        Setup key
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <code className="rounded-md border border-border-subtle bg-surface-inset px-3 py-1.5 font-mono text-sm tracking-wider text-text-primary">
                                            {setupMFa.data.secret.replace(/(.{4})/g, "$1 ").trim()}
                                        </code>
                                        <button
                                            className={secondaryBtn + " px-2.5 py-1.5"}
                                            onClick={copySecret}
                                        >
                                            {copied ? (
                                                <Check size={14} className="text-success" />
                                            ) : (
                                                <Copy size={14} />
                                            )}
                                            {copied ? "Copied" : "Copy"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Verify */}
                        <div className="space-y-3 border-t border-border-subtle pt-5">
                            <p className="text-sm font-medium text-text-secondary">
                                Enter the 6-digit code from your app
                            </p>
                            <div className="max-w-xs">
                                <SixDigitInput
                                    value={sixDigitVal}
                                    onChange={setSixDigitVal}
                                    onComplete={submitEnable}
                                    disabled={enableMfa.isPending}
                                    autoFocus={true}
                                />
                            </div>
                            {enableMfa.isError && (
                                <p className="text-sm text-error-text">
                                    {(enableMfa.error as Error).message}
                                </p>
                            )}
                            <div className="flex items-center gap-2 pt-1">
                                <button
                                    className={primaryBtn}
                                    disabled={
                                        enableMfa.isPending ||
                                        sixDigitVal.some((d) => d === "")
                                    }
                                    onClick={() => submitEnable(sixDigitVal.join(""))}
                                >
                                    {enableMfa.isPending && (
                                        <Loader2 size={14} className="animate-spin" />
                                    )}
                                    Verify &amp; enable
                                </button>
                                <button
                                    className={secondaryBtn}
                                    disabled={enableMfa.isPending}
                                    onClick={() => {
                                        setupMFa.reset();
                                        setSixDigitVal(["", "", "", "", "", ""]);
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )
            ) : !disable ? (
                /* ── Enrolled ───────────────────────────────────────────── */
                <div className="flex items-center gap-3 rounded-md border border-success-border bg-success-bg px-4 py-3">
                    <ShieldCheck size={20} className="shrink-0 text-success" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-success-text">
                            Authenticator app is on
                        </p>
                        {queryData.enrolledAt && (
                            <p className="text-xs text-text-muted">
                                Enabled {new Date(queryData.enrolledAt).toLocaleDateString()}
                            </p>
                        )}
                    </div>
                    <button className={secondaryBtn} onClick={() => setDisable(true)}>
                        Disable
                    </button>
                </div>
            ) : (
                /* ── Disable confirmation ───────────────────────────────── */
                <div className="space-y-4 rounded-md border border-error-border bg-error-bg px-4 py-4">
                    <div>
                        <h3 className="text-sm font-semibold text-text-primary">
                            Disable two-factor authentication
                        </h3>
                        <p className="text-sm text-text-muted">
                            Confirm it&rsquo;s you to turn it off.
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <input
                            type="text"
                            placeholder="Password or 6-digit code"
                            value={disableCode}
                            onChange={(e) => setDisableCode(e.target.value)}
                            className="w-full max-w-xs rounded-md border border-border-input bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <p className="text-xs text-text-muted">
                            Enter your current password or a 6-digit code from your
                            authenticator app.
                        </p>
                    </div>
                    {disableMfa.isError && (
                        <p className="text-sm text-error-text">
                            {(disableMfa.error as Error).message}
                        </p>
                    )}
                    <div className="flex items-center gap-2">
                        <button
                            className={dangerBtn}
                            disabled={disableMfa.isPending || !disableCode}
                            onClick={() => {
                                const v = disableCode.trim();
                                disableMfa.mutate(
                                    /^\d{6}$/.test(v) ? { code: v } : { password: v }
                                );
                            }}
                        >
                            {disableMfa.isPending && (
                                <Loader2 size={14} className="animate-spin" />
                            )}
                            Disable
                        </button>
                        <button
                            className={secondaryBtn}
                            disabled={disableMfa.isPending}
                            onClick={() => {
                                setDisable(false);
                                setDisableCode("");
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
