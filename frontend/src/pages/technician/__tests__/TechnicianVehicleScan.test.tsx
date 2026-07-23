import { renderHook, act } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { useScanDispatcher } from "../../../hooks/useScanDispatcher";
import type { InventoryItem } from "../../../types/inventory";

const mockResolveMutateAsync = vi.fn();
vi.mock("../../../hooks/useTracking", () => ({
	useResolveCodeMutation: () => ({ mutateAsync: mockResolveMutateAsync, isPending: false }),
}));

const item = { id: "i1", name: "Capacitor 45/5" } as InventoryItem;

beforeEach(() => {
	vi.clearAllMocks();
});

describe("technician scan routing", () => {
	test('type:"serial" opens the sheet and does not touch item focus', async () => {
		mockResolveMutateAsync.mockResolvedValue({
			type: "serial",
			code: "SER-0001",
			serialUnitId: "su1",
			status: "on_vehicle",
			item,
		});
		const onItem = vi.fn();
		const onSerial = vi.fn();
		const onNotFound = vi.fn();

		const { result } = renderHook(() => useScanDispatcher({ onItem, onSerial, onNotFound }));
		await act(async () => {
			await result.current.handleScan("SER-0001");
		});

		expect(onSerial).toHaveBeenCalledWith(expect.objectContaining({ serialUnitId: "su1", item }));
		expect(onItem).not.toHaveBeenCalled();
		expect(onNotFound).not.toHaveBeenCalled();
	});

	test('type:"item" still routes to the item focus handler (regression)', async () => {
		mockResolveMutateAsync.mockResolvedValue({ type: "item", item });
		const onItem = vi.fn();
		const onSerial = vi.fn();
		const onNotFound = vi.fn();

		const { result } = renderHook(() => useScanDispatcher({ onItem, onSerial, onNotFound }));
		await act(async () => {
			await result.current.handleScan("BC-123");
		});

		expect(onItem).toHaveBeenCalledWith(item);
		expect(onSerial).not.toHaveBeenCalled();
	});

	test('type:"batch" focuses the parent item in v1', async () => {
		mockResolveMutateAsync.mockResolvedValue({
			type: "batch",
			code: "LOT-1",
			batchId: "b1",
			batchNumber: "L-42",
			item,
		});
		const onItem = vi.fn();
		const onSerial = vi.fn();
		const onNotFound = vi.fn();

		// onBatch omitted → useScanDispatcher falls back to onItem(batch.item),
		// which is exactly the v1 behavior the spec asks for.
		const { result } = renderHook(() => useScanDispatcher({ onItem, onSerial, onNotFound }));
		await act(async () => {
			await result.current.handleScan("LOT-1");
		});

		expect(onItem).toHaveBeenCalledWith(item);
		expect(onSerial).not.toHaveBeenCalled();
	});

	test("an unresolvable code reaches onNotFound", async () => {
		mockResolveMutateAsync.mockRejectedValue(new Error("not found"));
		const onItem = vi.fn();
		const onNotFound = vi.fn();

		const { result } = renderHook(() => useScanDispatcher({ onItem, onNotFound }));
		await act(async () => {
			await result.current.handleScan("GARBAGE");
		});

		expect(onNotFound).toHaveBeenCalledWith("GARBAGE");
		expect(onItem).not.toHaveBeenCalled();
	});
});
