import { useRef, useState, useEffect, type ReactNode } from "react";
import { Upload, Trash2, Building2, Loader2, CheckCircle2, XCircle } from "lucide-react";
import {
	useOrgSettings,
	useUploadOrgLogo,
	useDeleteOrgLogo,
	useUpdateOrgSettings,
} from "../../hooks/useOrg";
import type { OrgSettingsUpdate } from "../../api/org";
import AddressForm from "../../components/ui/AddressForm";
import type { GeocodeResult } from "../../types/location";
import TaxSettingsSection from "./TaxSettingsSection";
import { usePermission } from "../../hooks/usePermission";
import {
	useQBStatusQuery,
	useQBConnectMutation,
	useQBDisconnectMutation,
} from "../../hooks/useQuickbooks";
import QBConnectionCard from "../quickbooks/QBConnectionCard";

// ── Layout primitive ─────────────────────────────────────────────────────────

interface SettingRowProps {
	title: string;
	description?: string;
	action?: ReactNode;
	children: ReactNode;
}

function SettingRow({ title, description, action, children }: SettingRowProps) {
	return (
		<div className="pt-2 pb-8">
			<div className="mb-4 flex items-center justify-between">
				<div>
					<h3 className="text-sm font-semibold text-text-primary">
						{title}
					</h3>
					{description && (
						<p className="mt-0.5 text-xs text-text-muted">
							{description}
						</p>
					)}
				</div>
				{action}
			</div>
			{children}
		</div>
	);
}

// ── Organization settings ─────────────────────────────────────────────────────

const inputBase =
	"w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary placeholder:text-faint outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary-border";

function OrgSettingsSection() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [logoImgError, setLogoImgError] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveSuccess, setSaveSuccess] = useState(false);
	const [nameError, setNameError] = useState<string | null>(null);

	const { data: org, isLoading } = useOrgSettings();
	const uploadMutation = useUploadOrgLogo();
	const deleteMutation = useDeleteOrgLogo();
	const updateMutation = useUpdateOrgSettings();

	// permissions
	const MANAGE_ORGANIZATION = usePermission("manage_organization");
	const MANAGE_TAXES = usePermission("manage_taxes");

	const [form, setForm] = useState<OrgSettingsUpdate>({
		name: "",
		phone: "",
		address: "",
		coords: null,
		email: "",
		website: "",
	});

	useEffect(() => {
		if (org) {
			setForm({
				name: org.name,
				phone: org.phone ?? "",
				address: org.address ?? "",
				coords: org.coords ?? null,
				email: org.email ?? "",
				website: org.website ?? "",
				restock_mode: org.restock_mode,
			});
			setLogoImgError(false);
		}
	}, [org]);

	useEffect(() => {
		return () => {
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		};
	}, []);

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		setUploadError(null);
		try {
			await uploadMutation.mutateAsync(file);
		} catch {
			setUploadError(
				"Upload failed. Ensure the file is a JPEG, PNG, or WebP under 5MB."
			);
		}
		if (fileInputRef.current) fileInputRef.current.value = "";
	};

	const handleRemove = async () => {
		setDeleteError(null);
		try {
			await deleteMutation.mutateAsync();
		} catch {
			setDeleteError("Failed to remove logo. Please try again.");
		}
	};

	const handleAddressChange = (result: GeocodeResult) => {
		setForm((prev) => ({ ...prev, address: result.address, coords: result.coords }));
	};

	const handleAddressClear = () => {
		setForm((prev) => ({ ...prev, address: "", coords: null }));
	};

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaveError(null);
		setSaveSuccess(false);
		setNameError(null);

		if (!form.name?.trim()) {
			setNameError("Organization name is required.");
			return;
		}

		try {
			await updateMutation.mutateAsync({
				name: form.name.trim(),
				phone: form.phone || null,
				address: form.address || null,
				coords: form.coords || null,
				email: form.email || null,
				website: form.website || null,
				...(form.restock_mode ? { restock_mode: form.restock_mode } : {}),
			});
			setSaveSuccess(true);
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
			saveTimerRef.current = setTimeout(() => setSaveSuccess(false), 3000);
		} catch {
			setSaveError("Failed to save changes. Please try again.");
		}
	};

	return (
		<div className="rounded-lg border border-border-subtle bg-base">
			{/* Logo */}
			<div className="border-b border-border-subtle px-5 py-5">
				<p className="mb-3 text-xs font-medium text-text-tertiary">Logo</p>
				<div className="flex items-center gap-5">
					{isLoading ? (
						<div className="h-12 w-12 flex-shrink-0 animate-pulse rounded-md bg-surface" />
					) : org?.logo_url && !logoImgError ? (
						<img
							src={org.logo_url ?? undefined}
							alt="Organization logo"
							className="h-12 w-12 flex-shrink-0 rounded-md object-contain bg-surface"
							onError={() => setLogoImgError(true)}
						/>
					) : (
						<div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-surface">
							<Building2
								size={20}
								className="text-text-muted"
							/>
						</div>
					)}

					<div>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() =>
									fileInputRef.current?.click()
								}
								disabled={uploadMutation.isPending}
								className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-border-strong hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
							>
								{uploadMutation.isPending ? (
									<Loader2
										size={12}
										className="animate-spin"
									/>
								) : (
									<Upload size={12} />
								)}
								{uploadMutation.isPending
									? "Uploading…"
									: "Upload Logo"}
							</button>

							{org?.logo_url && (
								<button
									type="button"
									onClick={handleRemove}
									disabled={
										deleteMutation.isPending
									}
									className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-error-text transition-colors hover:border-error-border hover:bg-error-bg disabled:cursor-not-allowed disabled:opacity-50"
								>
									{deleteMutation.isPending ? (
										<Loader2
											size={12}
											className="animate-spin"
										/>
									) : (
										<Trash2 size={12} />
									)}
									{deleteMutation.isPending
										? "Removing…"
										: "Remove"}
								</button>
							)}
						</div>

						{(uploadError || deleteError) && (
							<p className="mt-2 text-xs text-error-text">
								{uploadError ?? deleteError}
							</p>
						)}

						<p className="mt-2 text-xs text-text-muted">
							JPEG, PNG, or WebP · max 5 MB
						</p>
					</div>
				</div>

				<input
					ref={fileInputRef}
					type="file"
					accept="image/jpeg,image/png,image/webp"
					className="hidden"
					onChange={handleFileChange}
				/>
			</div>

			{/* Details form */}
			<form onSubmit={handleSave} className="px-5 py-5">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="sm:col-span-2">
						<label
							htmlFor="settings-name"
							className="mb-1 block text-xs font-medium text-text-tertiary"
						>
							Organization Name
						</label>
						{isLoading ? (
							<div className="h-8 animate-pulse rounded-md bg-surface" />
						) : (
							<input
								id="settings-name"
								type="text"
								value={form.name ?? ""}
								onChange={(e) => {
									const val = e.target.value;
									setForm((prev) => ({
										...prev,
										name: val,
									}));
									setNameError(
										val.trim() === ""
											? "Organization name is required."
											: null
									);
								}}
								className={`${inputBase} ${nameError ? "!border-error focus:!border-error focus:!ring-error" : ""}`}
							/>
						)}
						{nameError && (
							<p className="mt-1 text-xs text-error-text">
								{nameError}
							</p>
						)}
					</div>

					<div>
						<label
							htmlFor="settings-phone"
							className="mb-1 block text-xs font-medium text-text-tertiary"
						>
							Phone
						</label>
						{isLoading ? (
							<div className="h-8 animate-pulse rounded-md bg-surface" />
						) : (
							<input
								id="settings-phone"
								type="text"
								value={form.phone ?? ""}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										phone: e.target
											.value,
									}))
								}
								className={inputBase}
							/>
						)}
					</div>

					<div>
						<label
							htmlFor="settings-email"
							className="mb-1 block text-xs font-medium text-text-tertiary"
						>
							Email
						</label>
						{isLoading ? (
							<div className="h-8 animate-pulse rounded-md bg-surface" />
						) : (
							<input
								id="settings-email"
								type="text"
								value={form.email ?? ""}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										email: e.target
											.value,
									}))
								}
								className={inputBase}
							/>
						)}
					</div>

					<div className="sm:col-span-2">
						<label className="mb-1 block text-xs font-medium text-text-tertiary">
							Address
						</label>
						{isLoading ? (
							<div className="h-8 animate-pulse rounded-md bg-surface" />
						) : (
							<AddressForm
								mode="edit"
								originalValue={form.address ?? ""}
								originalCoords={
									form.coords ?? undefined
								}
								handleChange={handleAddressChange}
								handleClear={handleAddressClear}
							/>
						)}
					</div>

					<div>
						<label
							htmlFor="settings-website"
							className="mb-1 block text-xs font-medium text-text-tertiary"
						>
							Website
						</label>
						{isLoading ? (
							<div className="h-8 animate-pulse rounded-md bg-surface" />
						) : (
							<input
								id="settings-website"
								type="text"
								value={form.website ?? ""}
								onChange={(e) =>
									setForm((prev) => ({
										...prev,
										website: e.target
											.value,
									}))
								}
								className={inputBase}
							/>
						)}
					</div>
				</div>

				{/* Restock workflow emphasis — UX default only, never a capability gate */}
				<div className="mt-5">
					<span className="mb-1 block text-xs font-medium text-text-tertiary">
						Vehicle Restock Workflow
					</span>
					<p className="mb-2 text-xs text-text-muted">
						Changes which workflow the app emphasizes — it never restricts what
						roles are allowed to do (set that in Roles).
					</p>
					<div className="space-y-2">
						{(
							[
								{
									value: "tech_self_serve" as const,
									label: "Technician self-serve",
									description: "Techs restock their own vehicles from the warehouse",
								},
								{
									value: "dispatch_prepared" as const,
									label: "Dispatch prepared",
									description: "Techs request restocks; dispatch fulfills from the warehouse",
								},
							]
						).map((opt) => (
							<label
								key={opt.value}
								className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 transition-colors ${
									form.restock_mode === opt.value
										? "border-primary bg-primary-bg-subtle"
										: "border-border-subtle hover:bg-surface"
								}`}
							>
								<input
									type="radio"
									name="restock-mode"
									value={opt.value}
									checked={form.restock_mode === opt.value}
									onChange={() =>
										setForm((prev) => ({ ...prev, restock_mode: opt.value }))
									}
									className="mt-0.5 accent-(--color-primary)"
								/>
								<span>
									<span className="block text-xs font-medium text-text-primary">
										{opt.label}
									</span>
									<span className="block text-xs text-text-muted">
										{opt.description}
									</span>
								</span>
							</label>
						))}
					</div>
				</div>

				<div className="mt-5 flex items-center gap-3">
					<button
						type="submit"
						disabled={updateMutation.isPending || isLoading}
						className="flex items-center gap-1.5 rounded-md bg-primary-hover px-4 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
					>
						{updateMutation.isPending && (
							<Loader2
								size={12}
								className="animate-spin"
							/>
						)}
						{updateMutation.isPending
							? "Saving…"
							: "Save Changes"}
					</button>

					{saveSuccess && (
						<span className="text-xs text-success-text">
							Changes saved.
						</span>
					)}
					{saveError && (
						<span className="text-xs text-error-text">
							{saveError}
						</span>
					)}
				</div>
			</form>
		</div>
	);
}

// ── Toggle primitive ──────────────────────────────────────────────────────────

interface ToggleProps {
	checked: boolean;
	onChange: () => void;
	label: string;
}

function Toggle({ checked, onChange, label }: ToggleProps) {
	return (
		<label className="flex cursor-pointer items-center gap-2" onClick={onChange}>
			<div
				className={`relative h-4 w-7 rounded-full border transition-colors ${
					checked
						? "border-primary bg-primary"
						: "border-border bg-surface-inset"
				}`}
			>
				<span
					className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
						checked ? "translate-x-3" : "translate-x-0.5"
					}`}
				/>
			</div>
			<span className="text-xs text-text-muted">{label}</span>
		</label>
	);
}

// ── Settings page shell ───────────────────────────────────────────────────────

export default function SettingsSection() {
	const [showTaxInactive, setShowTaxInactive] = useState(false);

	const MANAGE_ORG = usePermission("manage_organization");
	const MANAGE_TAX = usePermission("manage_taxes");

	return (
		<div className="max-w-6xl">
			<div className="grid grid-cols-1 gap-x-8 lg:grid-cols-2 lg:items-start">
				{MANAGE_ORG && (
					<SettingRow
						title="Organization"
						description="Profile, branding, and contact information."
					>
						<OrgSettingsSection />
					</SettingRow>

				)}
				{MANAGE_TAX && (
					<SettingRow
						title="Tax"
						description="Rates and groups applied to quotes and invoices."
						action={
							<Toggle
								checked={showTaxInactive}
								onChange={() =>
									setShowTaxInactive((v) => !v)
								}
								label="Show inactive"
							/>
						}
					>
						<TaxSettingsSection showInactive={showTaxInactive} />
					</SettingRow>
				)}

				<SettingRow
					title="QuickBooks"
					description="Sync invoices and customers with QuickBooks Online."
				>
					<QBConnectionCard />
				</SettingRow>
			</div>
		</div>
	);
}



