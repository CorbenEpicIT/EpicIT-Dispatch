import { describe, it, expect } from "vitest";
import { renderTemplate, extractVariables } from "../templateRenderer.js";

describe("renderTemplate", () => {
	it("interpolates and HTML-escapes plain variables", () => {
		expect(renderTemplate("Hi {{name}}", { name: "Alex" })).toBe("Hi Alex");
		expect(renderTemplate("{{x}}", { x: "<b> & \"'" })).toBe("&lt;b&gt; &amp; &quot;&#39;");
	});

	it("does not escape triple-stache", () => {
		expect(renderTemplate("{{{html}}}", { html: "<b>x</b>" })).toBe("<b>x</b>");
	});

	it("resolves dotted paths", () => {
		expect(renderTemplate("{{brand.name}}", { brand: { name: "Acme" } })).toBe("Acme");
	});

	it("renders missing values as empty strings, never 'undefined'", () => {
		expect(renderTemplate("[{{missing}}]", {})).toBe("[]");
		expect(renderTemplate("[{{a.b.c}}]", { a: {} })).toBe("[]");
	});

	it("renders a section when truthy, skips it when falsy/empty", () => {
		const tpl = "{{#logo}}<img src={{logo}}>{{/logo}}";
		expect(renderTemplate(tpl, { logo: "u" })).toBe("<img src=u>");
		expect(renderTemplate(tpl, { logo: "" })).toBe("");
		expect(renderTemplate(tpl, {})).toBe("");
	});

	it("treats whitespace-only strings as empty in sections", () => {
		expect(renderTemplate("{{#a}}X{{/a}}", { a: "   " })).toBe("");
	});

	it("renders inverted sections when falsy", () => {
		const tpl = "{{#logo}}img{{/logo}}{{^logo}}{{name}}{{/logo}}";
		expect(renderTemplate(tpl, { name: "Acme" })).toBe("Acme");
		expect(renderTemplate(tpl, { logo: "u", name: "Acme" })).toBe("img");
	});

	it("supports dotted section names (the logo pattern in our templates)", () => {
		const tpl = "{{#brand.logo_url}}<img src=\"{{brand.logo_url}}\">{{/brand.logo_url}}";
		expect(renderTemplate(tpl, { brand: { logo_url: "https://x/y.png" } })).toBe(
			'<img src="https://x/y.png">',
		);
		expect(renderTemplate(tpl, { brand: {} })).toBe("");
	});

	it("drops comments", () => {
		expect(renderTemplate("a{{! note }}b", {})).toBe("ab");
	});

	it("does not throw on a malformed (unclosed) template", () => {
		expect(() => renderTemplate("{{#a}}oops", { a: true })).not.toThrow();
	});
});

describe("extractVariables", () => {
	it("returns unique names in first-seen order, excluding comments/closes", () => {
		const tpl = "{{a}} {{b}} {{a}} {{#c}}{{d}}{{/c}} {{! x }} {{{e}}}";
		expect(extractVariables(tpl)).toEqual(["a", "b", "c", "d", "e"]);
	});

	it("includes dotted paths", () => {
		expect(extractVariables("{{brand.name}} {{#brand.logo_url}}{{/brand.logo_url}}")).toEqual([
			"brand.name",
			"brand.logo_url",
		]);
	});
});
