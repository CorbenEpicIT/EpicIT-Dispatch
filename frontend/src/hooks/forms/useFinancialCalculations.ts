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

	const [taxRate, setTaxRateState] = useState<number>(initialTaxRate);
	const [discountType, setDiscountTypeState] = useState<DiscountType>(initialDiscountType);
	const [discountValue, setDiscountValueState] = useState<number>(initialDiscountValue);

	const [originalTaxRate, setOriginalTaxRate] = useState<number>(initialTaxRate);
	const [originalDiscountType, setOriginalDiscountType] =
		useState<DiscountType>(initialDiscountType);
	const [originalDiscountValue, setOriginalDiscountValue] =
		useState<number>(initialDiscountValue);

	const setTaxRate = useCallback((rate: number) => setTaxRateState(Number(rate)), []);
	const setDiscountType = useCallback((type: DiscountType) => setDiscountTypeState(type), []);
	const setDiscountValue = useCallback(
		(value: number) => setDiscountValueState(Number(value)),
		[]
	);

	const setOriginals = useCallback(
		(taxRate: number, discountType: DiscountType, discountValue: number) => {
			const t = Number(taxRate);
			const v = Number(discountValue);
			setTaxRateState(t);
			setDiscountTypeState(discountType);
			setDiscountValueState(v);
			setOriginalTaxRate(t);
			setOriginalDiscountType(discountType);
			setOriginalDiscountValue(v);
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

	const taxAmount = useMemo(
		() => Number(subtotal) * (Number(taxRate) / 100),
		[subtotal, taxRate]
	);

	const discountAmount = useMemo(() => {
		const s = Number(subtotal);
		const v = Number(discountValue);
		return discountType === "percent" ? s * (v / 100) : v;
	}, [subtotal, discountType, discountValue]);

	const total = useMemo(
		() => Number(subtotal) + taxAmount - discountAmount,
		[subtotal, taxAmount, discountAmount]
	);

	const undoTax = useCallback(() => setTaxRateState(originalTaxRate), [originalTaxRate]);

	const undoDiscount = useCallback(() => {
		setDiscountTypeState(originalDiscountType);
		setDiscountValueState(originalDiscountValue);
	}, [originalDiscountType, originalDiscountValue]);

	const reset = useCallback(() => {
		setTaxRateState(Number(initialTaxRate));
		setDiscountTypeState(initialDiscountType);
		setDiscountValueState(Number(initialDiscountValue));
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
