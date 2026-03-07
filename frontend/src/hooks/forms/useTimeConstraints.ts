import { useCallback, useEffect, useRef, useState } from "react";
import type { ArrivalConstraint, FinishConstraint } from "../../types/jobs";

interface UseTimeConstraintsOptions {
	mode?: "create" | "edit";
	initialArrivalConstraint?: ArrivalConstraint;
	initialFinishConstraint?: FinishConstraint;
	initialArrivalTime?: Date | null;
	initialArrivalWindowStart?: Date | null;
	initialArrivalWindowEnd?: Date | null;
	initialFinishTime?: Date | null;
	resetKey?: string | number;
}

interface UseTimeConstraintsReturn {
	arrivalConstraint: ArrivalConstraint;
	setArrivalConstraint: (value: ArrivalConstraint) => void;
	finishConstraint: FinishConstraint;
	setFinishConstraint: (value: FinishConstraint) => void;
	arrivalTime: Date | null;
	setArrivalTime: (value: Date | null) => void;
	arrivalWindowStart: Date | null;
	setArrivalWindowStart: (value: Date | null) => void;
	arrivalWindowEnd: Date | null;
	setArrivalWindowEnd: (value: Date | null) => void;
	finishTime: Date | null;
	setFinishTime: (value: Date | null) => void;

	reset: () => void;

	isArrivalConstraintDirty: boolean;
	isFinishConstraintDirty: boolean;
	isArrivalTimeDirty: boolean;
	isArrivalWindowStartDirty: boolean;
	isArrivalWindowEndDirty: boolean;
	isFinishTimeDirty: boolean;

	undoArrivalConstraint: () => void;
	undoFinishConstraint: () => void;
	undoArrivalTime: () => void;
	undoArrivalWindowStart: () => void;
	undoArrivalWindowEnd: () => void;
	undoFinishTime: () => void;
}

const makeTime = (hour: number, minute = 0) => {
	const d = new Date();
	d.setHours(hour, minute, 0, 0);
	return d;
};

const sameTime = (a: Date | null | undefined, b: Date | null | undefined) =>
	(a?.getTime() ?? null) === (b?.getTime() ?? null);

export const useTimeConstraints = (
	options: UseTimeConstraintsOptions = {}
): UseTimeConstraintsReturn => {
	const {
		mode = "create",
		resetKey,
		initialArrivalConstraint,
		initialFinishConstraint,
		initialArrivalTime,
		initialArrivalWindowStart,
		initialArrivalWindowEnd,
		initialFinishTime,
	} = options;

	// Compute resolved defaults — prefer provided initial values over hardcoded fallbacks
	const resolvedDefaults = {
		arrivalConstraint: (initialArrivalConstraint ?? "at") as ArrivalConstraint,
		finishConstraint: (initialFinishConstraint ?? "when_done") as FinishConstraint,
		arrivalTime: initialArrivalTime !== undefined ? initialArrivalTime : makeTime(9),
		arrivalWindowStart:
			initialArrivalWindowStart !== undefined
				? initialArrivalWindowStart
				: makeTime(9),
		arrivalWindowEnd:
			initialArrivalWindowEnd !== undefined
				? initialArrivalWindowEnd
				: makeTime(17),
		finishTime: initialFinishTime !== undefined ? initialFinishTime : makeTime(17),
	};

	const defaultsRef = useRef(resolvedDefaults);
	const originalsRef = useRef(resolvedDefaults);

	const [arrivalConstraint, setArrivalConstraint] = useState<ArrivalConstraint>(
		resolvedDefaults.arrivalConstraint
	);
	const [finishConstraint, setFinishConstraint] = useState<FinishConstraint>(
		resolvedDefaults.finishConstraint
	);
	const [arrivalTime, setArrivalTime] = useState<Date | null>(resolvedDefaults.arrivalTime);
	const [arrivalWindowStart, setArrivalWindowStart] = useState<Date | null>(
		resolvedDefaults.arrivalWindowStart
	);
	const [arrivalWindowEnd, setArrivalWindowEnd] = useState<Date | null>(
		resolvedDefaults.arrivalWindowEnd
	);
	const [finishTime, setFinishTime] = useState<Date | null>(resolvedDefaults.finishTime);

	// When resetKey changes, re-sync all state from latest initial props.
	// This is the mechanism for external resets (e.g. loading a draft).
	const prevResetKeyRef = useRef(resetKey);
	useEffect(() => {
		if (resetKey === undefined || resetKey === prevResetKeyRef.current) return;
		prevResetKeyRef.current = resetKey;

		const next = {
			arrivalConstraint: (initialArrivalConstraint ?? "at") as ArrivalConstraint,
			finishConstraint: (initialFinishConstraint ??
				"when_done") as FinishConstraint,
			arrivalTime:
				initialArrivalTime !== undefined ? initialArrivalTime : makeTime(9),
			arrivalWindowStart:
				initialArrivalWindowStart !== undefined
					? initialArrivalWindowStart
					: makeTime(9),
			arrivalWindowEnd:
				initialArrivalWindowEnd !== undefined
					? initialArrivalWindowEnd
					: makeTime(17),
			finishTime:
				initialFinishTime !== undefined ? initialFinishTime : makeTime(17),
		};

		defaultsRef.current = next;
		if (mode === "edit") originalsRef.current = next;

		setArrivalConstraint(next.arrivalConstraint);
		setFinishConstraint(next.finishConstraint);
		setArrivalTime(next.arrivalTime);
		setArrivalWindowStart(next.arrivalWindowStart);
		setArrivalWindowEnd(next.arrivalWindowEnd);
		setFinishTime(next.finishTime);
	}, [
		resetKey,
		mode,
		initialArrivalConstraint,
		initialFinishConstraint,
		initialArrivalTime,
		initialArrivalWindowStart,
		initialArrivalWindowEnd,
		initialFinishTime,
	]);

	const baseline = mode === "edit" ? originalsRef.current : defaultsRef.current;

	const isArrivalConstraintDirty = arrivalConstraint !== baseline.arrivalConstraint;
	const isFinishConstraintDirty = finishConstraint !== baseline.finishConstraint;
	const isArrivalTimeDirty = !sameTime(arrivalTime, baseline.arrivalTime);
	const isArrivalWindowStartDirty = !sameTime(
		arrivalWindowStart,
		baseline.arrivalWindowStart
	);
	const isArrivalWindowEndDirty = !sameTime(arrivalWindowEnd, baseline.arrivalWindowEnd);
	const isFinishTimeDirty = !sameTime(finishTime, baseline.finishTime);

	const undoArrivalConstraint = useCallback(() => {
		setArrivalConstraint(
			(mode === "edit" ? originalsRef.current : defaultsRef.current)
				.arrivalConstraint
		);
	}, [mode]);

	const undoFinishConstraint = useCallback(() => {
		setFinishConstraint(
			(mode === "edit" ? originalsRef.current : defaultsRef.current)
				.finishConstraint
		);
	}, [mode]);

	const undoArrivalTime = useCallback(() => {
		setArrivalTime(
			(mode === "edit" ? originalsRef.current : defaultsRef.current).arrivalTime
		);
	}, [mode]);

	const undoArrivalWindowStart = useCallback(() => {
		setArrivalWindowStart(
			(mode === "edit" ? originalsRef.current : defaultsRef.current)
				.arrivalWindowStart
		);
	}, [mode]);

	const undoArrivalWindowEnd = useCallback(() => {
		setArrivalWindowEnd(
			(mode === "edit" ? originalsRef.current : defaultsRef.current)
				.arrivalWindowEnd
		);
	}, [mode]);

	const undoFinishTime = useCallback(() => {
		setFinishTime(
			(mode === "edit" ? originalsRef.current : defaultsRef.current).finishTime
		);
	}, [mode]);

	const reset = useCallback(() => {
		const d = defaultsRef.current;
		setArrivalConstraint(d.arrivalConstraint);
		setFinishConstraint(d.finishConstraint);
		setArrivalTime(d.arrivalTime);
		setArrivalWindowStart(d.arrivalWindowStart);
		setArrivalWindowEnd(d.arrivalWindowEnd);
		setFinishTime(d.finishTime);
	}, []);

	return {
		arrivalConstraint,
		setArrivalConstraint,
		finishConstraint,
		setFinishConstraint,
		arrivalTime,
		setArrivalTime,
		arrivalWindowStart,
		setArrivalWindowStart,
		arrivalWindowEnd,
		setArrivalWindowEnd,
		finishTime,
		setFinishTime,
		reset,

		isArrivalConstraintDirty,
		isFinishConstraintDirty,
		isArrivalTimeDirty,
		isArrivalWindowStartDirty,
		isArrivalWindowEndDirty,
		isFinishTimeDirty,

		undoArrivalConstraint,
		undoFinishConstraint,
		undoArrivalTime,
		undoArrivalWindowStart,
		undoArrivalWindowEnd,
		undoFinishTime,
	};
};
