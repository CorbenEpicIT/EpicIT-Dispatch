import { useState, useEffect } from "react";
import { Send, X, Mail, FileText, Loader2, AlertCircle } from "lucide-react";
import FullPopup from "./FullPopup";

interface SendDocumentModalProps {
	isOpen: boolean;
	onClose: () => void;
	/** Called when the user confirms. Receives the (possibly edited) recipient email. */
	onSend: (email: string) => Promise<void>;
	docType: "quote" | "invoice";
	docNumber: string;
	clientName: string;
	/** Pre-filled recipient email from the client's primary contact. */
	contactEmail?: string | null;
	contactName?: string | null;
}

export default function SendDocumentModal({
	isOpen,
	onClose,
	onSend,
	docType,
	docNumber,
	clientName,
	contactEmail,
	contactName,
}: SendDocumentModalProps) {
	const [email, setEmail] = useState(contactEmail ?? "");
	const [isSending, setIsSending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Sync email when modal opens with fresh contact data
	useEffect(() => {
		if (isOpen) {
			setEmail(contactEmail ?? "");
			setError(null);
		}
	}, [isOpen, contactEmail]);

	const docLabel = docType === "quote" ? "Quote" : "Invoice";
	const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

	const handleSend = async () => {
		if (!emailIsValid) {
			setError("Please enter a valid email address.");
			return;
		}
		setIsSending(true);
		setError(null);
		try {
			await onSend(email.trim());
			onClose();
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Failed to send. Please try again.");
		} finally {
			setIsSending(false);
		}
	};

	const content = (
		<div className="flex flex-col">
			{/* Header */}
			<div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
				<div className="flex items-center gap-2">
					<Send size={18} className="text-blue-400" />
					<h2 className="text-base font-semibold text-white">
						Send {docLabel} to Client
					</h2>
				</div>
				<button
					onClick={onClose}
					className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors text-zinc-400 hover:text-white"
				>
					<X size={16} />
				</button>
			</div>

			{/* Body */}
			<div className="px-6 py-5 space-y-5">
				{/* Document summary */}
				<div className="flex items-start gap-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
					<FileText size={16} className="text-zinc-400 mt-0.5 flex-shrink-0" />
					<div>
						<p className="text-sm font-medium text-white">{docNumber}</p>
						<p className="text-xs text-zinc-400 mt-0.5">
							{docLabel} for{" "}
							<span className="text-zinc-300">{clientName}</span>
						</p>
					</div>
				</div>

				{/* Recipient */}
				<div>
					<label className="block text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
						Recipient
					</label>
					{contactName && (
						<p className="text-xs text-zinc-500 mb-2">{contactName}</p>
					)}
					<div className="relative">
						<Mail
							size={14}
							className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
						/>
						<input
							type="email"
							value={email}
							onChange={(e) => {
								setEmail(e.target.value);
								setError(null);
							}}
							placeholder="recipient@example.com"
							className="w-full pl-9 pr-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
						/>
					</div>
					{!contactEmail && (
						<p className="mt-1.5 text-xs text-amber-400 flex items-center gap-1">
							<AlertCircle size={12} />
							No primary contact email on file — enter one to proceed.
						</p>
					)}
				</div>

				{/* Error */}
				{error && (
					<div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md">
						<AlertCircle size={14} className="text-red-400 flex-shrink-0" />
						<p className="text-sm text-red-400">{error}</p>
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800">
				<button
					onClick={onClose}
					disabled={isSending}
					className="px-4 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					onClick={handleSend}
					disabled={isSending || !emailIsValid}
					className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md transition-colors"
				>
					{isSending ? (
						<Loader2 size={14} className="animate-spin" />
					) : (
						<Send size={14} />
					)}
					{isSending ? "Sending..." : `Send ${docLabel}`}
				</button>
			</div>
		</div>
	);

	return (
		<FullPopup
			content={content}
			isModalOpen={isOpen}
			onClose={onClose}
			size="md"
		/>
	);
}
