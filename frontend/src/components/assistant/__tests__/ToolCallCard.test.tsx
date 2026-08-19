import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "../../../test/testUtils";
import type { UiToolCall } from "../../../types/assistant";
import ToolCallCard from "../ToolCallCard";

const call = (over: Partial<UiToolCall> = {}): UiToolCall => ({
	id: "t1",
	name: "get_schedule",
	input: { start_date: "2026-08-25" },
	state: "ok",
	summary: "Read the schedule — 3 visits",
	durationMs: 42,
	...over,
});

describe("ToolCallCard", () => {
	it("leads with the plain-language summary, not the tool name", () => {
		render(<ToolCallCard call={call()} />);
		expect(screen.getByText("Read the schedule — 3 visits")).toBeInTheDocument();
	});

	it("falls back to a readable form of the tool name while running", () => {
		render(<ToolCallCard call={call({ state: "running", summary: undefined, durationMs: undefined })} />);
		expect(screen.getByText("Get schedule")).toBeInTheDocument();
	});

	it("shows the arguments only after the card is expanded", async () => {
		render(<ToolCallCard call={call()} />);
		expect(screen.queryByText(/start_date/)).not.toBeInTheDocument();

		await userEvent.click(screen.getByRole("button"));

		expect(screen.getByText(/start_date/)).toBeInTheDocument();
		expect(screen.getByText("get_schedule")).toBeInTheDocument();
	});

	it("surfaces the error message on a failed call", async () => {
		render(<ToolCallCard call={call({ state: "error", summary: "get_record failed", errorMessage: "gone" })} />);
		await userEvent.click(screen.getByRole("button"));
		expect(screen.getByText("gone")).toBeInTheDocument();
	});

	it.each([
		[42, "42ms"],
		[1500, "1.5s"],
	])("formats a %ims duration as %s", (ms, expected) => {
		render(<ToolCallCard call={call({ durationMs: ms })} />);
		expect(screen.getByText(expected)).toBeInTheDocument();
	});
});
