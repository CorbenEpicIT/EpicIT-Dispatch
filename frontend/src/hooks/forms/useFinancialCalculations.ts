import { useState, useMemo, useCallback } from "react";
import type { DiscountType, FinancialState } from "../../types/common";

interface UseFinancialCalculationsOptions {
	initialTaxRate?: number; // As percentage (0-100)
	initialDiscountType?: DiscountType;
	initialDiscountValue?: number;
}

interface UseFinancialCalculationsReturn extends FinancialState {
	setTaxRate: (rate: number) => void;
	setDiscountType: (type: DiscountType) => void;
	setDiscountValue: (value: number) => void;
	reset: () => void;
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

	const [originalTaxRate] = useState<number>(initialTaxRate);
	const [originalDiscountType] = useState<DiscountType>(initialDiscountType);
	const [originalDiscountValue] = useState<number>(initialDiscountValue);

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

	const undoTax = useCallback(() => {
		setTaxRate(originalTaxRate);
	}, [originalTaxRate]);

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
		originalTaxRate,
		originalDiscountType,
		originalDiscountValue,
		isTaxDirty,
		isDiscountDirty,
		undoTax,
		undoDiscount,
	};
};
