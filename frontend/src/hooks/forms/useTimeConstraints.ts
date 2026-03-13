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

	const defaultsRef = useRef({
		arrivalConstraint: (initialArrivalConstraint ?? "at") as ArrivalConstraint,
		finishConstraint: (initialFinishConstraint ?? "when_done") as FinishConstraint,
		arrivalTime: initialArrivalTime ?? makeTime(9),
		arrivalWindowStart: initialArrivalWindowStart ?? makeTime(9),
		arrivalWindowEnd: initialArrivalWindowEnd ?? makeTime(17),
		finishTime: initialFinishTime ?? makeTime(17),
	});

	const originalsRef = useRef({
		arrivalConstraint: defaultsRef.current.arrivalConstraint,
		finishConstraint: defaultsRef.current.finishConstraint,
		arrivalTime: defaultsRef.current.arrivalTime,
		arrivalWindowStart: defaultsRef.current.arrivalWindowStart,
		arrivalWindowEnd: defaultsRef.current.arrivalWindowEnd,
		finishTime: defaultsRef.current.finishTime,
	});

	useEffect(() => {
		if (!resetKey) return;

		defaultsRef.current = {
			arrivalConstraint: (initialArrivalConstraint ??
				defaultsRef.current.arrivalConstraint) as ArrivalConstraint,
			finishConstraint: (initialFinishConstraint ??
				defaultsRef.current.finishConstraint) as FinishConstraint,
			arrivalTime: initialArrivalTime ?? defaultsRef.current.arrivalTime,
			arrivalWindowStart:
				initialArrivalWindowStart ?? defaultsRef.current.arrivalWindowStart,
			arrivalWindowEnd:
				initialArrivalWindowEnd ?? defaultsRef.current.arrivalWindowEnd,
			finishTime: initialFinishTime ?? defaultsRef.current.finishTime,
		};

		if (mode === "edit") {
			originalsRef.current = { ...defaultsRef.current };
		}
	}, [
		mode,
		resetKey,
		initialArrivalConstraint,
		initialFinishConstraint,
		initialArrivalTime,
		initialArrivalWindowStart,
		initialArrivalWindowEnd,
		initialFinishTime,
	]);

	const [arrivalConstraint, setArrivalConstraint] = useState<ArrivalConstraint>(
		defaultsRef.current.arrivalConstraint
	);
	const [finishConstraint, setFinishConstraint] = useState<FinishConstraint>(
		defaultsRef.current.finishConstraint
	);
	const [arrivalTime, setArrivalTime] = useState<Date | null>(
		defaultsRef.current.arrivalTime
	);
	const [arrivalWindowStart, setArrivalWindowStart] = useState<Date | null>(
		defaultsRef.current.arrivalWindowStart
	);
	const [arrivalWindowEnd, setArrivalWindowEnd] = useState<Date | null>(
		defaultsRef.current.arrivalWindowEnd
	);
	const [finishTime, setFinishTime] = useState<Date | null>(defaultsRef.current.finishTime);

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
