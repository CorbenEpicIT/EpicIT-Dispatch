import type { ZodError } from "zod";

export type StepFieldMap<T extends number> = Record<T, string[]>;

export function createStepRouter<T extends number>(stepFieldMap: StepFieldMap<T>) {
	return (error: ZodError): T | null => {
		const errorPaths = new Set(error.issues.map((i) => String(i.path[0])));

		const sortedEntries = (Object.entries(stepFieldMap) as [string, string[]][]).sort(
			([a], [b]) => Number(a) - Number(b)
		);

		for (const [stepStr, fields] of sortedEntries) {
			if (fields.some((f) => errorPaths.has(f))) {
				return Number(stepStr) as T;
			}
		}
		return null;
	};
}
