import { render, screen, act } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import Drawer from "./Drawer";

// The panel mounts hidden and transitions in on a 10ms timer — advance past it
// so the visible-state classes are the ones under assertion.
async function renderOpen(props: Partial<React.ComponentProps<typeof Drawer>> = {}) {
	const result = render(
		<Drawer isOpen onClose={() => {}} title="Test Drawer" {...props}>
			<p>body</p>
		</Drawer>,
	);
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 30));
	});
	return result;
}

describe("Drawer side variants", () => {
	test("side omitted renders the right-anchored panel exactly as before", async () => {
		await renderOpen();
		const panel = screen.getByRole("dialog", { name: "Test Drawer" });
		expect(panel.className).toContain("top-0");
		expect(panel.className).toContain("right-0");
		expect(panel.className).toContain("h-full");
		expect(panel.className).toContain("border-l");
		expect(panel.className).toContain("translate-x-0");
		expect(panel.className).not.toContain("translate-y");
		expect(panel.className).not.toContain("max-h-[85vh]");
	});

	test('side="right" is identical to omitting side', async () => {
		const { unmount } = await renderOpen();
		const defaultClasses = screen.getByRole("dialog", { name: "Test Drawer" }).className;
		unmount();

		await renderOpen({ side: "right" });
		expect(screen.getByRole("dialog", { name: "Test Drawer" }).className).toBe(defaultClasses);
	});

	test('side="bottom" renders a bottom-anchored sheet', async () => {
		await renderOpen({ side: "bottom" });
		const panel = screen.getByRole("dialog", { name: "Test Drawer" });
		expect(panel.className).toContain("bottom-0");
		expect(panel.className).toContain("max-h-[85vh]");
		expect(panel.className).toContain("border-t");
		expect(panel.className).toContain("rounded-t-xl");
		expect(panel.className).toContain("translate-y-0");
		expect(panel.className).not.toContain("translate-x");
	});

	test("both variants keep the 200ms ease-out motion spec", async () => {
		await renderOpen({ side: "bottom" });
		const panel = screen.getByRole("dialog", { name: "Test Drawer" });
		expect(panel.className).toContain("duration-200");
		expect(panel.className).toContain("ease-out");
	});

	test('side="center" renders a centered modal card, not an edge-anchored sheet', async () => {
		await renderOpen({ side: "center" });
		const panel = screen.getByRole("dialog", { name: "Test Drawer" });
		expect(panel.className).toContain("max-w-lg");
		expect(panel.className).toContain("max-h-[85vh]");
		expect(panel.className).toContain("rounded-xl");
		expect(panel.className).toContain("scale-100");
		expect(panel.className).not.toContain("translate-x");
		expect(panel.className).not.toContain("translate-y");
		expect(panel.className).not.toContain("bottom-0");
		expect(panel.className).not.toContain("right-0");
	});

	test('side="center" keeps the 200ms ease-out motion spec', async () => {
		await renderOpen({ side: "center" });
		const panel = screen.getByRole("dialog", { name: "Test Drawer" });
		expect(panel.className).toContain("duration-200");
		expect(panel.className).toContain("ease-out");
	});

	test('side="center" closes on an off-click outside the panel', async () => {
		const onClose = vi.fn();
		await renderOpen({ side: "center", onClose });
		const panel = screen.getByRole("dialog", { name: "Test Drawer" });
		// The centering wrapper is the panel's parent; clicking it (outside the
		// panel) is the off-click.
		await act(async () => {
			panel.parentElement?.dispatchEvent(
				new MouseEvent("mousedown", { bubbles: true }),
			);
		});
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	test('side="center" does not close on a click inside the panel', async () => {
		const onClose = vi.fn();
		await renderOpen({ side: "center", onClose });
		await act(async () => {
			screen.getByText("body").dispatchEvent(
				new MouseEvent("mousedown", { bubbles: true }),
			);
		});
		expect(onClose).not.toHaveBeenCalled();
	});

	test("Escape closes regardless of side", async () => {
		const onClose = vi.fn();
		await renderOpen({ side: "bottom", onClose });
		await act(async () => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		});
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
