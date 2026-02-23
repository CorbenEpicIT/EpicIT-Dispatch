import { useState, useMemo, useCallback } from "react";
import type { DiscountType, FinancialState } from "../../types/common";

interface UseFinancialCalculationsOptions {
	initialTaxRate?: number;
	initialDiscountType?: DiscountType;
	initialDiscountValue?: number;
}

interface UseFinancialCalculationsReturn extends FinancialState {
	setTaxRate: (rate: number) => void;
	setDiscountType: (type: DiscountType) => void;
	setDiscountValue: (value: number) => void;
	reset: () => void;
	setOriginals: (taxRate: number, discountType: DiscountType, discountValue: number) => void;
	originalTaxRate: number;
	originalDiscountType: DiscountType;
	originalDiscountValue: number;
	isTaxDirty: boolean;
	isDiscountDirty: boolean;
	undoTax: () => void;
	undoDiscount: () => void;
}

export const useFinancialCalculations = (
	subtotal: number,
	options: UseFinancialCalculationsOptions = {}
): UseFinancialCalculationsReturn => {
	const {
		initialTaxRate = 0,
		initialDiscountType = "amount",
		initialDiscountValue = 0,
	} = options;

	const [taxRate, setTaxRate] = useState<number>(initialTaxRate);
	const [discountType, setDiscountType] = useState<DiscountType>(initialDiscountType);
	const [discountValue, setDiscountValue] = useState<number>(initialDiscountValue);

	const [originalTaxRate, setOriginalTaxRate] = useState<number>(initialTaxRate);
	const [originalDiscountType, setOriginalDiscountType] =
		useState<DiscountType>(initialDiscountType);
	const [originalDiscountValue, setOriginalDiscountValue] =
		useState<number>(initialDiscountValue);

	const setOriginals = useCallback(
		(taxRate: number, discountType: DiscountType, discountValue: number) => {
			setTaxRate(taxRate);
			setDiscountType(discountType);
			setDiscountValue(discountValue);
			setOriginalTaxRate(taxRate);
			setOriginalDiscountType(discountType);
			setOriginalDiscountValue(discountValue);
		},
		[]
	);

	const isTaxDirty = useMemo(() => taxRate !== originalTaxRate, [taxRate, originalTaxRate]);

	const isDiscountDirty = useMemo(
		() =>
			discountType !== originalDiscountType ||
			discountValue !== originalDiscountValue,
		[discountType, discountValue, originalDiscountType, originalDiscountValue]
	);

	const taxAmount = useMemo(() => subtotal * (taxRate / 100), [subtotal, taxRate]);

	const discountAmount = useMemo(
		() =>
			discountType === "percent"
				? subtotal * (discountValue / 100)
				: discountValue,
		[subtotal, discountType, discountValue]
	);

	const total = useMemo(
		() => subtotal + taxAmount - discountAmount,
		[subtotal, taxAmount, discountAmount]
	);

	const undoTax = useCallback(() => setTaxRate(originalTaxRate), [originalTaxRate]);

	const undoDiscount = useCallback(() => {
		setDiscountType(originalDiscountType);
		setDiscountValue(originalDiscountValue);
	}, [originalDiscountType, originalDiscountValue]);

	const reset = useCallback(() => {
		setTaxRate(initialTaxRate);
		setDiscountType(initialDiscountType);
		setDiscountValue(initialDiscountValue);
	}, [initialTaxRate, initialDiscountType, initialDiscountValue]);

	return {
		taxRate,
		setTaxRate,
		taxAmount,
		discountType,
		setDiscountType,
		discountValue,
		setDiscountValue,
		discountAmount,
		total,
		reset,
		setOriginals,
		originalTaxRate,
		originalDiscountType,
		originalDiscountValue,
		isTaxDirty,
		isDiscountDirty,
		undoTax,
		undoDiscount,
	};
};
