import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PasswordSetField from "../forms/PasswordSetField";

const renderField = (props: Partial<React.ComponentProps<typeof PasswordSetField>> = {}) =>
	render(
		<PasswordSetField
			enabled
			onEnabledChange={vi.fn()}
			password=""
			onPasswordChange={vi.fn()}
			description="Set a password for this account"
			{...props}
		/>,
	);

describe("PasswordSetField (07-F12)", () => {
	it("marks the input as a new password so browsers do not autofill the saved one", () => {
		renderField();
		const input = screen.getByPlaceholderText("Enter password");
		expect(input).toHaveAttribute("autocomplete", "new-password");
		expect(input).toHaveAttribute("type", "password");
	});

	it("reveal toggle switches the input to text and back", () => {
		renderField({ password: "hunter22" });
		const input = screen.getByPlaceholderText("Enter password");
		fireEvent.click(screen.getByRole("button", { name: "Show password" }));
		expect(input).toHaveAttribute("type", "text");
		fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
		expect(input).toHaveAttribute("type", "password");
	});
});
