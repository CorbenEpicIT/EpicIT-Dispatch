/// <reference types="node" />
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import bcryptjs from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const ORG_TIMEZONE = "America/Chicago";

/**
 * Returns a UTC Date representing h:m on the same calendar day as `base`
 * when interpreted in America/Chicago timezone. Handles DST automatically.
 */
function dateAt(base: Date, h: number, m = 0): Date {
	// Get the Chicago calendar date from base (YYYY-MM-DD)
	const chicagoDateStr = base.toLocaleDateString("en-CA", { timeZone: ORG_TIMEZONE });
	// Build a naive UTC anchor at h:m on this calendar date
	const anchor = new Date(`${chicagoDateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
	// Find what Chicago local time this UTC anchor maps to
	// In a UTC environment, toLocaleString output parses back as UTC — this measures the offset
	const chicagoOfAnchor = new Date(anchor.toLocaleString("en-US", { timeZone: ORG_TIMEZONE }));
	// Apply the offset to convert naive UTC → correct UTC for this Chicago local time
	const offsetMs = anchor.getTime() - chicagoOfAnchor.getTime();
	return new Date(anchor.getTime() + offsetMs);
}

/**
 * Returns a Date anchored to the same calendar day as `offset` days from now
 * in America/Chicago timezone. Positioned at 18:00 UTC (safe afternoon in Chicago)
 * so it's unambiguous when passed to dateAt() as a base.
 */
function daysFromNow(offset: number): Date {
	const now = new Date();
	const chicagoDateStr = now.toLocaleDateString("en-CA", { timeZone: ORG_TIMEZONE }); // "YYYY-MM-DD"
	const [y, mo, d] = chicagoDateStr.split("-").map(Number);
	return new Date(Date.UTC(y, mo - 1, d + offset, 18, 0, 0));
}

function firstOfMonth(monthOffset: number): Date {
	const d = new Date();
	d.setMonth(d.getMonth() + monthOffset, 1);
	d.setHours(0, 0, 0, 0);
	return d;
}

async function main() {
	console.log("Seeding database...");

	// ============================================================================
	// Organization
	// ============================================================================

	const org = await db.organization.create({
		data: {
			name:     "Epic HVAC Services",
			timezone: "America/Chicago",
			tax_rate: 0.0825,
			phone:    "(608) 555-0142",
			address:  "1857 Sand Lake Road, Onalaska, WI 54650",
			coords:   { lat: 44.7441, lon: -91.2396 },
			email:    "info@epicitautomations.com",
			website:  "epicitautomations.com",
		},
	});

	// ============================================================================
	// Users
	// ============================================================================

	const dispatcherPassword = await bcryptjs.hash("password123", 10);
	const techPassword = await bcryptjs.hash("password123", 10);

	const dispatcher = await db.dispatcher.create({
		data: {
			organization_id: org.id,
			name: "Alex Mercer",
			email: "admin@epichvac.com",
			phone: "6082550100",
			password: dispatcherPassword,
			title: "Operations Manager",
			description: "Lead dispatcher and operations manager.",
			email_verified_at: new Date(),
			email_verification_token: null,
			role: "admin",
		},
	});

	const [tech1, tech2, tech3] = await Promise.all([
		db.technician.create({
			data: {
				organization_id: org.id,
				name: "John Smith",
				email: "john.smith@epichvac.com",
				phone: "6082550101",
				password: techPassword,
				title: "Senior HVAC Technician",
				description:
					"10 years experience. Specializes in commercial systems.",
				status: "Available",
				hire_date: new Date("2015-03-12"),
				coords: { lat: 43.8014, lng: -91.2396 },
				hourly_rate: 95.00,
			},
		}),
		db.technician.create({
			data: {
				organization_id: org.id,
				name: "Maria Rodriguez",
				email: "maria.rodriguez@epichvac.com",
				phone: "6082550102",
				password: techPassword,
				title: "HVAC Technician",
				description:
					"5 years experience. Residential and light commercial.",
				status: "Busy",
				hire_date: new Date("2020-07-01"),
				coords: { lat: 43.8129, lng: -91.2559 },
				hourly_rate: 75.00,
			},
		}),
		db.technician.create({
			data: {
				organization_id: org.id,
				name: "Kevin Park",
				email: "kevin.park@epichvac.com",
				phone: "6082550103",
				password: techPassword,
				title: "HVAC Technician",
				description: "3 years experience. Residential specialist.",
				status: "Offline",
				hire_date: new Date("2022-04-18"),
				coords: { lat: 43.8014, lng: -91.2396 },
				hourly_rate: 65.00,
			},
		}),
	]);

	// ============================================================================
	// Inventory — created early so visits can reference inventory_item_id
	// ============================================================================

	const [
		invRefrigerant,
		invFilter,
		invCapacitor,
		invThermostat,
		invContactor,
	] = await Promise.all([
		db.inventory_item.create({
			data: {
				organization_id: org.id,
				name: "Refrigerant R-410A (25 lb cylinder)",
				description:
					"Standard residential/light commercial refrigerant.",
				location: "Warehouse — Shelf A1",
				quantity: 8,
				unit_price: 60.0,
				cost: 38.0,
				sku: "REF-410A-25",
				low_stock_threshold: 3,
			},
		}),
		db.inventory_item.create({
			data: {
				organization_id: org.id,
				name: "Air Filter 16x25x1 MERV-8",
				description:
					"Standard replacement filter for residential split systems.",
				location: "Warehouse — Shelf B3",
				quantity: 48,
				unit_price: 8.5,
				cost: 3.25,
				sku: "FILT-16251-M8",
				low_stock_threshold: 12,
			},
		}),
		db.inventory_item.create({
			data: {
				organization_id: org.id,
				name: "Capacitor 45+5 MFD 440V Round",
				description:
					"Dual run capacitor for condenser fan and compressor.",
				location: "Parts Room — Bin C7",
				quantity: 15,
				unit_price: 22.0,
				cost: 8.5,
				sku: "CAP-45-5-440",
				low_stock_threshold: 5,
			},
		}),
		db.inventory_item.create({
			data: {
				organization_id: org.id,
				name: "Honeywell T6 Pro Programmable Thermostat",
				description:
					"7-day programmable thermostat, universal compatibility.",
				location: "Parts Room — Bin D2",
				quantity: 6,
				unit_price: 65.0,
				cost: 32.0,
				sku: "TSTAT-T6PRO",
				low_stock_threshold: 2,
			},
		}),
		db.inventory_item.create({
			data: {
				organization_id: org.id,
				name: "Contactor 2-Pole 40A 24V",
				description:
					"Replacement contactor for condenser units up to 5 tons.",
				location: "Parts Room — Bin C8",
				quantity: 2,
				unit_price: 28.0,
				cost: 11.0,
				sku: "CONT-2P-40A",
				low_stock_threshold: 4,
			},
		}),
	]);

	// ============================================================================
	// Contacts
	// ============================================================================

	const [contact1, contact2, contact3, contact4, contact5, contact6] =
		await Promise.all([
			db.contact.create({
				data: {
					organization_id: org.id,
					name: "Robert Johnson",
					email: "robert.johnson@email.com",
					phone: "6082551001",
					type: "customer",
				},
			}),
			db.contact.create({
				data: {
					organization_id: org.id,
					name: "Jennifer Lee",
					email: "j.lee@smithcommercial.com",
					phone: "6082551002",
					type: "customer",
				},
			}),
			db.contact.create({
				data: {
					organization_id: org.id,
					name: "Sarah Williams",
					email: "sarah@williamsproperty.com",
					phone: "6082551003",
					type: "customer",
				},
			}),
			db.contact.create({
				data: {
					organization_id: org.id,
					name: "Michael Anderson",
					email: "m.anderson@andersonoffice.com",
					phone: "6082551004",
					type: "customer",
				},
			}),
			db.contact.create({
				data: {
					organization_id: org.id,
					name: "Tom Davis",
					email: "t.davis@andersonoffice.com",
					phone: "6082551005",
					type: "customer",
				},
			}),
			db.contact.create({
				data: {
					organization_id: org.id,
					name: "Linda Nguyen",
					email: "l.nguyen@riversideapts.com",
					phone: "6082551006",
					type: "customer",
				},
			}),
		]);

	// ============================================================================
	// Clients
	// ============================================================================

	const [client1, client2, client3, client4, client5] = await Promise.all([
		db.client.create({
			data: {
				organization_id: org.id,
				name: "Johnson Residence",
				address: "2842 Main St, La Crosse, WI 54601",
				coords: { lat: 43.8124, lng: -91.2568 },
				is_tax_exempt: false,
			},
		}),
		db.client.create({
			data: {
				organization_id: org.id,
				name: "Smith Commercial Properties",
				address: "401 Main St, La Crosse, WI 54601",
				coords: { lat: 43.8129, lng: -91.2559 },
				is_tax_exempt: false,
			},
		}),
		db.client.create({
			data: {
				organization_id: org.id,
				name: "Williams Property Management",
				address: "3003 Losey Blvd S, La Crosse, WI 54601",
				coords: { lat: 43.7889, lng: -91.2297 },
				is_tax_exempt: false,
			},
		}),
		db.client.create({
			data: {
				organization_id: org.id,
				name: "Anderson Office Complex",
				address: "3800 Commerce St, La Crosse, WI 54603",
				coords: { lat: 43.8334, lng: -91.2601 },
				is_tax_exempt: true,
			},
		}),
		db.client.create({
			data: {
				organization_id: org.id,
				name: "Riverside Apartments LLC",
				address: "1420 Rose St, La Crosse, WI 54603",
				coords: { lat: 43.8198, lng: -91.2514 },
				is_tax_exempt: false,
			},
		}),
	]);

	// Link contacts → clients
	await Promise.all([
		db.client_contact.create({
			data: {
				client_id: client1.id,
				contact_id: contact1.id,
				relationship: "owner",
				is_primary: true,
				is_billing: true,
			},
		}),
		db.client_contact.create({
			data: {
				client_id: client2.id,
				contact_id: contact2.id,
				relationship: "manager",
				is_primary: true,
				is_billing: true,
			},
		}),
		db.client_contact.create({
			data: {
				client_id: client3.id,
				contact_id: contact3.id,
				relationship: "owner",
				is_primary: true,
				is_billing: true,
			},
		}),
		db.client_contact.create({
			data: {
				client_id: client4.id,
				contact_id: contact4.id,
				relationship: "manager",
				is_primary: true,
				is_billing: false,
			},
		}),
		db.client_contact.create({
			data: {
				client_id: client4.id,
				contact_id: contact5.id,
				relationship: "contact",
				is_primary: false,
				is_billing: true,
			},
		}),
		db.client_contact.create({
			data: {
				client_id: client5.id,
				contact_id: contact6.id,
				relationship: "manager",
				is_primary: true,
				is_billing: true,
			},
		}),
	]);

	await Promise.all([
		db.client_note.create({
			data: {
				organization_id: org.id,
				client_id: client1.id,
				content:
					"Customer prefers morning appointments. Dog in backyard — call ahead before accessing side gate.",
				creator_dispatcher_id: dispatcher.id,
			},
		}),
		db.client_note.create({
			data: {
				organization_id: org.id,
				client_id: client4.id,
				content:
					"Tax exempt — verify certificate on file annually. Contact Tom Davis for access to mechanical room on sub-level.",
				creator_dispatcher_id: dispatcher.id,
			},
		}),
		db.client_note.create({
			data: {
				organization_id: org.id,
				client_id: client5.id,
				content:
					"24-unit complex. HVAC access requires 48hr notice to tenants. Linda prefers email communication for scheduling.",
				creator_dispatcher_id: dispatcher.id,
			},
		}),
	]);

	// ============================================================================
	// Service Requests
	// ============================================================================

	const [req1, req2, req3, req4, req5] = await Promise.all([
		// ConvertedToJob — AC repair (Johnson)
		db.request.create({
			data: {
				organization_id: org.id,
				client_id: client1.id,
				title: "AC Not Cooling",
				description:
					"Main AC unit is running but not producing cold air. House is 82°F.",
				priority: "High",
				address: client1.address,
				coords: { lat: 43.8124, lng: -91.2568 },
				status: "ConvertedToJob",
				source: "phone",
				created_by_dispatcher_id: dispatcher.id,
			},
		}),
		// Quoted — commercial furnace (Smith)
		db.request.create({
			data: {
				organization_id: org.id,
				client_id: client2.id,
				title: "Furnace Not Starting",
				description:
					"Rooftop unit on building 2 will not ignite. Tenants reporting cold offices.",
				priority: "Urgent",
				address: client2.address,
				coords: { lat: 43.8129, lng: -91.2559 },
				status: "Quoted",
				source: "email",
				requires_quote: true,
				created_by_dispatcher_id: dispatcher.id,
			},
		}),
		// New — annual PM (Williams)
		db.request.create({
			data: {
				organization_id: org.id,
				client_id: client3.id,
				title: "Annual Preventive Maintenance — 4 Units",
				description:
					"Requesting annual maintenance for 4 residential units across managed properties.",
				priority: "Low",
				address: client3.address,
				coords: { lat: 43.7889, lng: -91.2297 },
				status: "New",
				source: "web",
				created_by_dispatcher_id: dispatcher.id,
			},
		}),
		// Reviewing — thermostat replacement (Riverside Apartments)
		db.request.create({
			data: {
				organization_id: org.id,
				client_id: client5.id,
				title: "Thermostat Replacement — Units 4, 8, 12",
				description:
					"Three units have failing programmable thermostats not holding set points overnight.",
				priority: "Medium",
				address: client5.address,
				coords: { lat: 43.8198, lng: -91.2514 },
				status: "Reviewing",
				source: "phone",
				requires_quote: true,
				estimated_value: 350.0,
				created_by_dispatcher_id: dispatcher.id,
			},
		}),
		// Cancelled — duct cleaning (Johnson)
		db.request.create({
			data: {
				organization_id: org.id,
				client_id: client1.id,
				title: "Duct Cleaning — Full House",
				description: "Customer requested full duct cleaning estimate.",
				priority: "Low",
				address: client1.address,
				coords: { lat: 43.8124, lng: -91.2568 },
				status: "Cancelled",
				source: "phone",
				cancelled_at: daysFromNow(-10),
				cancellation_reason:
					"Customer decided to postpone until next spring.",
				created_by_dispatcher_id: dispatcher.id,
			},
		}),
	]);

	await Promise.all([
		db.request_note.create({
			data: {
				organization_id: org.id,
				request_id: req2.id,
				content:
					"Jennifer confirmed the unit has been making a clicking sound for 2 days before failing. Likely igniter or gas valve issue.",
				creator_dispatcher_id: dispatcher.id,
			},
		}),
		db.request_note.create({
			data: {
				organization_id: org.id,
				request_id: req4.id,
				content:
					"Spoke with Linda — units 4 and 8 are most urgent. Unit 12 is secondary. Building access any weekday after 9am.",
				creator_dispatcher_id: dispatcher.id,
			},
		}),
	]);

	// ============================================================================
	// Quotes
	// ============================================================================

	// Q-0001: Approved — rooftop unit replacement (Smith)
	const quote1 = await db.quote.create({
		data: {
			organization_id: org.id,
			quote_number: "Q-0001",
			client_id: client2.id,
			request_id: req2.id,
			title: "Rooftop Unit Replacement — Bldg 2",
			description:
				"Replace failed 5-ton rooftop unit with Carrier 48TCED06A2A5.",
			status: "Approved",
			address: client2.address,
			coords: { lat: 43.8129, lng: -91.2559 },
			priority: "Urgent",
			subtotal: 6800.0,
			tax_rate: 0.0825,
			tax_amount: 561.0,
			total: 7361.0,
			sent_at: daysFromNow(-5),
			viewed_at: daysFromNow(-4),
			approved_at: daysFromNow(-3),
			created_by_dispatcher_id: dispatcher.id,
			line_items: {
				create: [
					{
						name: "Carrier 5-Ton Rooftop Unit 48TCED06A2A5",
						quantity: 1,
						unit_price: 4800.0,
						total: 4800.0,
						item_type: "equipment",
						sort_order: 0,
					},
					{
						name: "Installation Labor",
						quantity: 8,
						unit_price: 175.0,
						total: 1400.0,
						item_type: "labor",
						sort_order: 1,
					},
					{
						name: "Refrigerant R-410A (10 lbs)",
						quantity: 10,
						unit_price: 60.0,
						total: 600.0,
						item_type: "material",
						sort_order: 2,
					},
				],
			},
		},
	});

	// Q-0002: Draft — thermostat replacement (Riverside), with percent discount
	const quote2 = await db.quote.create({
		data: {
			organization_id: org.id,
			quote_number: "Q-0002",
			client_id: client5.id,
			request_id: req4.id,
			title: "Thermostat Replacement — Riverside Apts Units 4, 8, 12",
			description:
				"Replace 3 failing programmable thermostats with Honeywell T6 Pro units. Includes installation and system test.",
			status: "Draft",
			address: client5.address,
			coords: { lat: 43.8198, lng: -91.2514 },
			priority: "Medium",
			subtotal: 300.0,
			tax_rate: 0.0825,
			discount_type: "percent",
			discount_value: 10.0,
			discount_amount: 30.0,
			tax_amount: 22.28,
			total: 292.28,
			valid_until: daysFromNow(14),
			created_by_dispatcher_id: dispatcher.id,
			line_items: {
				create: [
					{
						name: "Honeywell T6 Pro Programmable Thermostat",
						quantity: 3,
						unit_price: 65.0,
						total: 195.0,
						item_type: "equipment",
						sort_order: 0,
					},
					{
						name: "Installation Labor (1 hr × 3 units)",
						quantity: 3,
						unit_price: 35.0,
						total: 105.0,
						item_type: "labor",
						sort_order: 1,
					},
				],
			},
		},
	});

	await Promise.all([
		db.quote_note.create({
			data: {
				organization_id: org.id,
				quote_id: quote1.id,
				content:
					"Approved via phone by Jennifer Lee. Purchase order pending from accounting.",
				creator_dispatcher_id: dispatcher.id,
			},
		}),
		db.quote_note.create({
			data: {
				organization_id: org.id,
				quote_id: quote2.id,
				content:
					"10% new-client discount applied. Confirm thermostat compatibility with 2-wire baseboard heat in units 4 and 12 before sending.",
				creator_dispatcher_id: dispatcher.id,
			},
		}),
	]);

	// ============================================================================
	// Recurring Plans
	// ============================================================================

	const occurrencePastStart = dateAt(firstOfMonth(-1), 8);
	const occurrencePastEnd = dateAt(firstOfMonth(-1), 12);
	const occurrenceSkippedStart = dateAt(firstOfMonth(-3), 8);
	const occurrenceSkippedEnd = dateAt(firstOfMonth(-3), 12);
	const occurrenceFutureStart = dateAt(firstOfMonth(1), 8);
	const occurrenceFutureEnd = dateAt(firstOfMonth(1), 12);
	const weeklyOccStart1 = dateAt(daysFromNow(-7), 7);
	const weeklyOccEnd1 = dateAt(daysFromNow(-7), 9);
	const weeklyOccStart2 = dateAt(daysFromNow(7), 7);
	const weeklyOccEnd2 = dateAt(daysFromNow(7), 9);

	// Plan 1: Monthly — Williams Properties (per_visit billing, on_completion invoicing)
	const recurringPlan1 = await db.recurring_plan.create({
		data: {
			organization_id: org.id,
			client_id: client3.id,
			name: "Monthly HVAC Maintenance — Williams Properties",
			description:
				"Monthly preventive maintenance across all Williams Property Management units. Includes filter replacement, coil inspection, and full system check.",
			address: client3.address,
			coords: { lat: 43.7889, lon: -91.2297 },
			priority: "Medium",
			status: "Active",
			starts_at: daysFromNow(-180),
			timezone: "America/Chicago",
			billing_mode: "per_visit",
			invoice_timing: "on_completion",
			created_by_dispatcher_id: dispatcher.id,
			rules: {
				create: [
					{
						frequency: "monthly",
						interval: 1,
						by_month_day: 1,
						arrival_constraint: "between",
						finish_constraint: "when_done",
						arrival_window_start: "08:00",
						arrival_window_end: "09:00",
					},
				],
			},
			line_items: {
				create: [
					{
						name: "PM Labor (4 hrs)",
						quantity: 4,
						unit_price: 125.0,
						item_type: "labor",
						sort_order: 0,
					},
					{
						name: "Air Filter 16x25x1 MERV-8 (4-pack)",
						quantity: 4,
						unit_price: 8.5,
						item_type: "material",
						sort_order: 1,
					},
				],
			},
		},
	});

	// Plan 2: Weekly — Anderson Office Complex (subscription, schedule-date invoicing, uses recurring_rule_weekday)
	const recurringPlan2 = await db.recurring_plan.create({
		data: {
			organization_id: org.id,
			client_id: client4.id,
			name: "Weekly Filter Checks — Anderson Office Complex",
			description:
				"Weekly MERV-13 filter inspection and replacement for 3 rooftop units. Required by building air quality policy.",
			address: client4.address,
			coords: { lat: 43.8334, lon: -91.2601 },
			priority: "Low",
			status: "Active",
			starts_at: daysFromNow(-90),
			timezone: "America/Chicago",
			billing_mode: "subscription",
			invoice_timing: "on_schedule_date",
			created_by_dispatcher_id: dispatcher.id,
			rules: {
				create: [
					{
						frequency: "weekly",
						interval: 1,
						arrival_constraint: "at",
						finish_constraint: "when_done",
						arrival_time: "07:00",
						by_weekday: {
							create: [{ weekday: "MO" }],
						},
					},
				],
			},
			line_items: {
				create: [
					{
						name: "Filter Inspection Labor (1 hr)",
						quantity: 1,
						unit_price: 95.0,
						item_type: "labor",
						sort_order: 0,
					},
					{
						name: "MERV-13 Filter 20x25x2 (3-pack)",
						quantity: 1,
						unit_price: 45.0,
						item_type: "material",
						sort_order: 1,
					},
				],
			},
		},
	});

	// Invoice schedules for both plans
	await Promise.all([
		db.invoice_schedule.create({
			data: {
				recurring_plan_id: recurringPlan1.id,
				frequency: "on_visit_completion",
				billing_basis: "visit_actuals",
				payment_terms_days: 30,
				auto_send: false,
				memo_template:
					"Monthly HVAC maintenance services — Williams Properties",
				is_active: true,
				next_invoice_at: occurrenceFutureStart,
				last_invoiced_at: occurrencePastStart,
			},
		}),
		db.invoice_schedule.create({
			data: {
				recurring_plan_id: recurringPlan2.id,
				frequency: "monthly",
				billing_basis: "plan_line_items",
				day_of_month: 1,
				payment_terms_days: 15,
				auto_send: true,
				memo_template:
					"Weekly HVAC filter service — Anderson Office Complex",
				is_active: true,
				next_invoice_at: firstOfMonth(1),
				last_invoiced_at: firstOfMonth(-1),
			},
		}),
	]);

	await Promise.all([
		db.recurring_plan_note.create({
			data: {
				organization_id: org.id,
				recurring_plan_id: recurringPlan1.id,
				content:
					"Sarah requested visits always on the 1st of the month before 9am so tenants are not disturbed during business hours.",
				creator_dispatcher_id: dispatcher.id,
			},
		}),
		db.recurring_plan_note.create({
			data: {
				organization_id: org.id,
				recurring_plan_id: recurringPlan2.id,
				content:
					"Anderson building requires sign-in at front desk. Security badge must be requested from Tom Davis at least 24hrs in advance.",
				creator_dispatcher_id: dispatcher.id,
			},
		}),
	]);

	// ============================================================================
	// Jobs
	// ============================================================================

	const [job1, job2, job3, job4, job5, job6] = await Promise.all([
		// J-0001: Completed — AC repair (Johnson)
		db.job.create({
			data: {
				organization_id: org.id,
				job_number: "J-0001",
				name: "AC Repair — Johnson Residence",
				description:
					"Diagnose and repair AC unit not producing cold air.",
				priority: "High",
				address: client1.address,
				coords: { lat: 43.8124, lng: -91.2568 },
				status: "Completed",
				client_id: client1.id,
				request_id: req1.id,
				subtotal: 485.0,
				tax_rate: 0.0825,
				tax_amount: 40.01,
				actual_total: 525.01,
				completed_at: daysFromNow(-2),
				line_items: {
					create: [
						{
							name: "Capacitor 45+5 MFD 440V",
							quantity: 1,
							unit_price: 85.0,
							total: 85.0,
							source: "field_addition",
							item_type: "material",
						},
						{
							name: "Service Labor (2.5 hrs)",
							quantity: 2.5,
							unit_price: 160.0,
							total: 400.0,
							source: "field_addition",
							item_type: "labor",
						},
					],
				},
			},
		}),
		// J-0002: InProgress — rooftop replacement (Smith)
		db.job.create({
			data: {
				organization_id: org.id,
				job_number: "J-0002",
				name: "Rooftop Unit Replacement — Smith Commercial Bldg 2",
				description:
					"Replace 5-ton rooftop unit per approved quote Q-0001.",
				priority: "Urgent",
				address: client2.address,
				coords: { lat: 43.8129, lng: -91.2559 },
				status: "InProgress",
				client_id: client2.id,
				request_id: req2.id,
				quote_id: quote1.id,
				subtotal: 6800.0,
				tax_rate: 0.0825,
				tax_amount: 561.0,
				estimated_total: 7361.0,
				line_items: {
					create: [
						{
							name: "Carrier 5-Ton Rooftop Unit 48TCED06A2A5",
							quantity: 1,
							unit_price: 4800.0,
							total: 4800.0,
							source: "quote",
							item_type: "equipment",
						},
						{
							name: "Installation Labor",
							quantity: 8,
							unit_price: 175.0,
							total: 1400.0,
							source: "quote",
							item_type: "labor",
						},
						{
							name: "Refrigerant R-410A (10 lbs)",
							quantity: 10,
							unit_price: 60.0,
							total: 600.0,
							source: "quote",
							item_type: "material",
						},
					],
				},
			},
		}),
		// J-0003: Scheduled — annual PM (Anderson)
		db.job.create({
			data: {
				organization_id: org.id,
				job_number: "J-0003",
				name: "Annual PM — Anderson Office Complex",
				description:
					"Annual preventive maintenance for 3 rooftop units and 12 VAV boxes.",
				priority: "Medium",
				address: client4.address,
				coords: { lat: 43.8334, lng: -91.2601 },
				status: "Scheduled",
				client_id: client4.id,
				subtotal: 1200.0,
				tax_rate: 0.0,
				tax_amount: 0.0,
				estimated_total: 1200.0,
				line_items: {
					create: [
						{
							name: "Annual PM Labor (8 hrs)",
							quantity: 8,
							unit_price: 125.0,
							total: 1000.0,
							source: "manual",
							item_type: "labor",
						},
						{
							name: "MERV-13 Filter 20x25x2 (3-pack)",
							quantity: 2,
							unit_price: 45.0,
							total: 90.0,
							source: "manual",
							item_type: "material",
						},
						{
							name: "Miscellaneous Parts Allowance",
							quantity: 1,
							unit_price: 110.0,
							total: 110.0,
							source: "manual",
							item_type: "other",
						},
					],
				},
			},
		}),
		// J-0004: Recurring container — Williams (plan 1)
		db.job.create({
			data: {
				organization_id: org.id,
				job_number: "J-0004",
				name: "Monthly PM — Williams Property Management",
				description: "Recurring monthly HVAC maintenance contract.",
				priority: "Medium",
				address: client3.address,
				coords: { lat: 43.7889, lng: -91.2297 },
				status: "InProgress",
				client_id: client3.id,
				recurring_plan_id: recurringPlan1.id,
				subtotal: 534.0,
				tax_rate: 0.0825,
				tax_amount: 44.05,
				estimated_total: 578.05,
			},
		}),
		// J-0005: Recurring container — Anderson (plan 2)
		db.job.create({
			data: {
				organization_id: org.id,
				job_number: "J-0005",
				name: "Weekly Filter Checks — Anderson Office Complex",
				description:
					"Recurring weekly filter inspection and replacement contract.",
				priority: "Low",
				address: client4.address,
				coords: { lat: 43.8334, lng: -91.2601 },
				status: "InProgress",
				client_id: client4.id,
				recurring_plan_id: recurringPlan2.id,
				subtotal: 140.0,
				tax_rate: 0.0,
				tax_amount: 0.0,
				estimated_total: 140.0,
			},
		}),
		// J-0006: Cancelled — emergency boiler inspection (Riverside)
		db.job.create({
			data: {
				organization_id: org.id,
				job_number: "J-0006",
				name: "Emergency Boiler Inspection — Riverside Apartments",
				description:
					"Tenant reported gas smell near boiler room. Dispatched for immediate inspection.",
				priority: "Emergency",
				address: client5.address,
				coords: { lat: 43.8198, lng: -91.2514 },
				status: "Cancelled",
				client_id: client5.id,
				subtotal: 0.0,
				tax_rate: 0.0825,
				tax_amount: 0.0,
				estimated_total: 0.0,
				cancelled_at: daysFromNow(-5),
				cancellation_reason:
					"Gas company responded first and cleared the site. No HVAC work required.",
			},
		}),
	]);

	// Connect quote1 → job2
	await db.quote.update({
		where: { id: quote1.id },
		data: { job: { connect: { id: job2.id } } },
	});

	await Promise.all([
		db.job_note.create({
			data: {
				organization_id: org.id,
				job_id: job1.id,
				content:
					"Technician found failed dual run capacitor. Replaced on-site and topped off refrigerant. System fully operational at completion.",
				creator_dispatcher_id: dispatcher.id,
			},
		}),
		db.job_note.create({
			data: {
				organization_id: org.id,
				job_id: job2.id,
				content:
					"Crane access arranged for rooftop. Building management confirmed loading dock available from 7am.",
				creator_dispatcher_id: dispatcher.id,
			},
		}),
		db.job_note.create({
			data: {
				organization_id: org.id,
				job_id: job3.id,
				content:
					"Anderson building requires sign-in at main lobby security desk. Tom Davis will meet tech at 8am.",
				creator_dispatcher_id: dispatcher.id,
			},
		}),
		db.job_note.create({
			data: {
				organization_id: org.id,
				job_id: job6.id,
				content:
					"Gas company (WE Energies) cleared the scene — minor odor from unrelated water heater vent. No HVAC issue found.",
				creator_dispatcher_id: dispatcher.id,
			},
		}),
	]);

	// ============================================================================
	// Job Visits
	// ============================================================================

	const yesterday = daysFromNow(-1);
	const today = new Date();
	const tomorrow = daysFromNow(1);
	const nextWeek = daysFromNow(7);

	// Visit 1: Completed — job1 AC repair (inventory-linked capacitor)
	const visit1 = await db.job_visit.create({
		data: {
			job_id: job1.id,
			name: "AC Diagnosis & Repair",
			description: "Diagnose cooling issue, replace failed capacitor.",
			arrival_constraint: "at",
			finish_constraint: "when_done",
			arrival_time: "09:00",
			scheduled_start_at: dateAt(yesterday, 9),
			scheduled_end_at: dateAt(yesterday, 12),
			actual_start_at: dateAt(yesterday, 9, 15),
			actual_end_at: dateAt(yesterday, 11, 30),
			status: "Completed",
			subtotal: 485.0,
			tax_rate: 0.0825,
			tax_amount: 40.01,
			total: 525.01,
			visit_techs: { create: { tech_id: tech2.id } },
			line_items: {
				create: [
					{
						name: "Capacitor 45+5 MFD 440V",
						quantity: 1,
						unit_price: 85.0,
						total: 85.0,
						source: "field_addition",
						item_type: "material",
						sort_order: 0,
						inventory_item_id: invCapacitor.id,
					},
					{
						name: "Service Labor (2.5 hrs)",
						quantity: 2.5,
						unit_price: 160.0,
						total: 400.0,
						source: "field_addition",
						item_type: "labor",
						sort_order: 1,
					},
				],
			},
		},
	});

	await db.job_note.create({
		data: {
			organization_id: org.id,
			job_id: job1.id,
			visit_id: visit1.id,
			content:
				"Arrived on time. Capacitor tested at 38+3.8 MFD (spec: 45+5). Replaced and recharged 1 lb R-410A. Customer signed off.",
			creator_tech_id: tech2.id,
		},
	});

	// Visit 2: OnSite — job2 rooftop installation (inventory-linked refrigerant)
	const visit2 = await db.job_visit.create({
		data: {
			job_id: job2.id,
			name: "Equipment Removal & Installation",
			description: "Remove old unit, install new Carrier 48TCED06A2A5.",
			arrival_constraint: "at",
			finish_constraint: "when_done",
			arrival_time: "07:00",
			scheduled_start_at: dateAt(today, 7),
			scheduled_end_at: dateAt(today, 17),
			actual_start_at: dateAt(today, 7, 10),
			status: "OnSite",
			subtotal: 6800.0,
			tax_rate: 0.0825,
			tax_amount: 561.0,
			total: 7361.0,
			visit_techs: {
				create: [{ tech_id: tech1.id }, { tech_id: tech2.id }],
			},
			line_items: {
				create: [
					{
						name: "Carrier 5-Ton Rooftop Unit 48TCED06A2A5",
						quantity: 1,
						unit_price: 4800.0,
						total: 4800.0,
						source: "quote",
						item_type: "equipment",
						sort_order: 0,
					},
					{
						name: "Installation Labor",
						quantity: 8,
						unit_price: 175.0,
						total: 1400.0,
						source: "quote",
						item_type: "labor",
						sort_order: 1,
					},
					{
						name: "Refrigerant R-410A (10 lbs)",
						quantity: 10,
						unit_price: 60.0,
						total: 600.0,
						source: "quote",
						item_type: "material",
						sort_order: 2,
						inventory_item_id: invRefrigerant.id,
					},
				],
			},
		},
	});

	// Visit 3: Scheduled — job3 annual PM (Anderson, next week)
	const visit3 = await db.job_visit.create({
		data: {
			job_id: job3.id,
			name: "Annual PM — Rooftop Units & VAV Boxes",
			description:
				"Full annual PM: clean coils, replace filters, test all VAV boxes, check refrigerant levels.",
			arrival_constraint: "between",
			finish_constraint: "when_done",
			arrival_window_start: "08:00",
			arrival_window_end: "09:00",
			scheduled_start_at: dateAt(nextWeek, 8),
			scheduled_end_at: dateAt(nextWeek, 14),
			status: "Scheduled",
			visit_techs: { create: { tech_id: tech1.id } },
			line_items: {
				create: [
					{
						name: "Annual PM Labor (8 hrs)",
						quantity: 8,
						unit_price: 125.0,
						total: 1000.0,
						source: "manual",
						item_type: "labor",
						sort_order: 0,
					},
					{
						name: "MERV-13 Filter 20x25x2 (3-pack)",
						quantity: 2,
						unit_price: 45.0,
						total: 90.0,
						source: "manual",
						item_type: "material",
						sort_order: 1,
					},
					{
						name: "Miscellaneous Parts Allowance",
						quantity: 1,
						unit_price: 110.0,
						total: 110.0,
						source: "manual",
						item_type: "other",
						sort_order: 2,
					},
				],
			},
		},
	});

	// Visit 4: Completed — plan1 recurring (last month, inventory-linked filter)
	const recurringVisit1 = await db.job_visit.create({
		data: {
			job_id: job4.id,
			name: "Monthly PM — Williams Properties",
			description:
				"Monthly filter replacement and system inspection across all units.",
			arrival_constraint: "between",
			finish_constraint: "when_done",
			arrival_window_start: "08:00",
			arrival_window_end: "09:00",
			scheduled_start_at: occurrencePastStart,
			scheduled_end_at: occurrencePastEnd,
			actual_start_at: dateAt(occurrencePastStart, 8, 5),
			actual_end_at: dateAt(occurrencePastStart, 11, 50),
			status: "Completed",
			subtotal: 534.0,
			tax_rate: 0.0825,
			tax_amount: 44.05,
			total: 578.05,
			visit_techs: { create: { tech_id: tech1.id } },
			line_items: {
				create: [
					{
						name: "PM Labor (4 hrs)",
						quantity: 4,
						unit_price: 125.0,
						total: 500.0,
						source: "recurring_plan",
						item_type: "labor",
						sort_order: 0,
					},
					{
						name: "Air Filter 16x25x1 MERV-8 (4-pack)",
						quantity: 4,
						unit_price: 8.5,
						total: 34.0,
						source: "recurring_plan",
						item_type: "material",
						sort_order: 1,
						inventory_item_id: invFilter.id,
					},
				],
			},
		},
	});

	// Visit 5: Completed — plan2 weekly (last week, tech3)
	const weeklyVisit1 = await db.job_visit.create({
		data: {
			job_id: job5.id,
			name: "Weekly Filter Check — Anderson Office",
			description:
				"Inspect and replace MERV-13 filters in all 3 rooftop units.",
			arrival_constraint: "at",
			finish_constraint: "when_done",
			arrival_time: "07:00",
			scheduled_start_at: weeklyOccStart1,
			scheduled_end_at: weeklyOccEnd1,
			actual_start_at: dateAt(weeklyOccStart1, 7, 5),
			actual_end_at: dateAt(weeklyOccStart1, 8, 45),
			status: "Completed",
			subtotal: 140.0,
			tax_rate: 0.0,
			tax_amount: 0.0,
			total: 140.0,
			visit_techs: { create: { tech_id: tech3.id } },
			line_items: {
				create: [
					{
						name: "Filter Inspection Labor (1 hr)",
						quantity: 1,
						unit_price: 95.0,
						total: 95.0,
						source: "recurring_plan",
						item_type: "labor",
						sort_order: 0,
					},
					{
						name: "MERV-13 Filter 20x25x2 (3-pack)",
						quantity: 1,
						unit_price: 45.0,
						total: 45.0,
						source: "recurring_plan",
						item_type: "material",
						sort_order: 1,
					},
				],
			},
		},
	});

	// Visit 6: Scheduled — plan2 weekly (next week, generated occurrence)
	const weeklyVisit2 = await db.job_visit.create({
		data: {
			job_id: job5.id,
			name: "Weekly Filter Check — Anderson Office",
			description:
				"Inspect and replace MERV-13 filters in all 3 rooftop units.",
			arrival_constraint: "at",
			finish_constraint: "when_done",
			arrival_time: "07:00",
			scheduled_start_at: weeklyOccStart2,
			scheduled_end_at: weeklyOccEnd2,
			status: "Scheduled",
			visit_techs: { create: { tech_id: tech3.id } },
		},
	});

	// Visit 7: Driving — tech3 en route to job3 pre-check (Driving status)
	const visit7 = await db.job_visit.create({
		data: {
			job_id: job3.id,
			name: "Pre-Inspection Site Survey",
			description:
				"Quick site survey to confirm scope before scheduled annual PM.",
			arrival_constraint: "at",
			finish_constraint: "when_done",
			arrival_time: "10:00",
			scheduled_start_at: dateAt(today, 10),
			scheduled_end_at: dateAt(today, 11),
			actual_start_at: dateAt(today, 9, 50),
			status: "Driving",
			visit_techs: { create: { tech_id: tech3.id } },
		},
	});

	// Visit 8: Paused — job4 recurring PM mid-work (Paused status)
	const visit8 = await db.job_visit.create({
		data: {
			job_id: job4.id,
			name: "Emergency Coil Cleaning — Unit 2",
			description:
				"Unscheduled coil cleaning discovered during routine inspection.",
			arrival_constraint: "anytime",
			finish_constraint: "when_done",
			scheduled_start_at: dateAt(today, 13),
			scheduled_end_at: dateAt(today, 15),
			actual_start_at: dateAt(today, 13, 5),
			status: "Paused",
			visit_techs: { create: { tech_id: tech1.id } },
			line_items: {
				create: [
					{
						name: "Coil Cleaning Labor (1.5 hrs)",
						quantity: 1.5,
						unit_price: 125.0,
						total: 187.5,
						source: "field_addition",
						item_type: "labor",
						sort_order: 0,
					},
					{
						name: "Coil Cleaner Solution",
						quantity: 1,
						unit_price: 22.0,
						total: 22.0,
						source: "field_addition",
						item_type: "material",
						sort_order: 1,
					},
				],
			},
		},
	});

	await db.job_note.create({
		data: {
			organization_id: org.id,
			job_id: job4.id,
			visit_id: recurringVisit1.id,
			content:
				"All 4 units serviced. Unit 3 had a slightly dirty evaporator coil — cleaned on-site. No refrigerant issues.",
			creator_tech_id: tech1.id,
		},
	});

	// ============================================================================
	// John Smith — Today + Tomorrow visits for dashboard testing
	// Dates computed at seed time so they're always current on DB reinit
	// ============================================================================

	// Today 1: Scheduled morning (active/next visit on dashboard)
	await db.job_visit.create({
		data: {
			job_id: job3.id,
			name: "Filter Replacement — Anderson Bldg A",
			description:
				"Replace MERV-8 filters in all first-floor air handlers.",
			arrival_constraint: "at",
			finish_constraint: "when_done",
			arrival_time: "08:00",
			scheduled_start_at: dateAt(today, 8),
			scheduled_end_at: dateAt(today, 10),
			status: "Scheduled",
			visit_techs: { create: { tech_id: tech1.id } },
			line_items: {
				create: [
					{
						name: "Filter Replacement Labor (2 hrs)",
						quantity: 2,
						unit_price: 95.0,
						total: 190.0,
						source: "manual",
						item_type: "labor",
						sort_order: 0,
					},
					{
						name: "Air Filter 16x25x1 MERV-8 (6-pack)",
						quantity: 6,
						unit_price: 8.5,
						total: 51.0,
						source: "manual",
						item_type: "material",
						sort_order: 1,
						inventory_item_id: invFilter.id,
					},
				],
			},
		},
	});

	// Today 2: Scheduled midday
	await db.job_visit.create({
		data: {
			job_id: job1.id,
			name: "Follow-Up AC Check — Johnson Residence",
			description:
				"Post-repair verification — confirm system holding pressure and cooling properly.",
			arrival_constraint: "between",
			finish_constraint: "when_done",
			arrival_window_start: "11:00",
			arrival_window_end: "12:00",
			scheduled_start_at: dateAt(today, 11),
			scheduled_end_at: dateAt(today, 12, 30),
			status: "Scheduled",
			visit_techs: { create: { tech_id: tech1.id } },
		},
	});

	// Today 3: Anytime — tests "Anytime today" label + sorted to end of list
	await db.job_visit.create({
		data: {
			job_id: job4.id,
			name: "Thermostat Calibration — Williams Unit 7",
			description:
				"Customer reports thermostat overshooting. Anytime access — key in lockbox.",
			arrival_constraint: "anytime",
			finish_constraint: "when_done",
			scheduled_start_at: dateAt(today, 0),
			scheduled_end_at: dateAt(today, 23, 59),
			status: "Scheduled",
			visit_techs: { create: { tech_id: tech1.id } },
		},
	});

	// Tomorrow 1: Scheduled morning — appears in condensed tomorrow row
	await db.job_visit.create({
		data: {
			job_id: job3.id,
			name: "Annual PM — Anderson Bldg B Rooftop Unit",
			description:
				"Rooftop unit coil cleaning, refrigerant check, and belt inspection.",
			arrival_constraint: "at",
			finish_constraint: "when_done",
			arrival_time: "09:00",
			scheduled_start_at: dateAt(tomorrow, 9),
			scheduled_end_at: dateAt(tomorrow, 13),
			status: "Scheduled",
			visit_techs: { create: { tech_id: tech1.id } },
			line_items: {
				create: [
					{
						name: "PM Labor (4 hrs)",
						quantity: 4,
						unit_price: 125.0,
						total: 500.0,
						source: "manual",
						item_type: "labor",
						sort_order: 0,
					},
				],
			},
		},
	});

	// Tomorrow 2: Scheduled afternoon — causes "+1 more" on dashboard tomorrow row
	await db.job_visit.create({
		data: {
			job_id: job5.id,
			name: "Condenser Coil Cleaning — Anderson Unit 2",
			description:
				"Annual coil cleaning and system check for Unit 2 condenser.",
			arrival_constraint: "at",
			finish_constraint: "when_done",
			arrival_time: "14:00",
			scheduled_start_at: dateAt(tomorrow, 14),
			scheduled_end_at: dateAt(tomorrow, 16),
			status: "Scheduled",
			visit_techs: { create: { tech_id: tech1.id } },
		},
	});

	// ============================================================================
	// Recurring Occurrences
	// ============================================================================

	await Promise.all([
		// Plan 1 — skipped (3 months ago, holiday conflict)
		db.recurring_occurrence.create({
			data: {
				recurring_plan_id: recurringPlan1.id,
				occurrence_start_at: occurrenceSkippedStart,
				occurrence_end_at: occurrenceSkippedEnd,
				status: "skipped",
				skipped_at: occurrenceSkippedStart,
				skip_reason:
					"New Year's holiday — building closed. Rescheduled maintenance folded into February visit.",
				generated_at: daysFromNow(-100),
				arrival_constraint: "between",
				finish_constraint: "when_done",
				arrival_window_start: "08:00",
				arrival_window_end: "09:00",
			},
		}),
		// Plan 1 — completed (last month)
		db.recurring_occurrence.create({
			data: {
				recurring_plan_id: recurringPlan1.id,
				occurrence_start_at: occurrencePastStart,
				occurrence_end_at: occurrencePastEnd,
				status: "completed",
				job_visit_id: recurringVisit1.id,
				generated_at: daysFromNow(-45),
				completed_at: dateAt(occurrencePastStart, 11, 50),
				arrival_constraint: "between",
				finish_constraint: "when_done",
				arrival_window_start: "08:00",
				arrival_window_end: "09:00",
			},
		}),
		// Plan 1 — planned (next month)
		db.recurring_occurrence.create({
			data: {
				recurring_plan_id: recurringPlan1.id,
				occurrence_start_at: occurrenceFutureStart,
				occurrence_end_at: occurrenceFutureEnd,
				status: "planned",
				arrival_constraint: "between",
				finish_constraint: "when_done",
				arrival_window_start: "08:00",
				arrival_window_end: "09:00",
			},
		}),
		// Plan 2 — completed (last week)
		db.recurring_occurrence.create({
			data: {
				recurring_plan_id: recurringPlan2.id,
				occurrence_start_at: weeklyOccStart1,
				occurrence_end_at: weeklyOccEnd1,
				status: "completed",
				job_visit_id: weeklyVisit1.id,
				generated_at: daysFromNow(-14),
				completed_at: dateAt(weeklyOccStart1, 8, 45),
				arrival_constraint: "at",
				finish_constraint: "when_done",
				arrival_time: "07:00",
			},
		}),
		// Plan 2 — generated (next week, linked to scheduled visit)
		db.recurring_occurrence.create({
			data: {
				recurring_plan_id: recurringPlan2.id,
				occurrence_start_at: weeklyOccStart2,
				occurrence_end_at: weeklyOccEnd2,
				status: "generated",
				job_visit_id: weeklyVisit2.id,
				generated_at: daysFromNow(-7),
				arrival_constraint: "at",
				finish_constraint: "when_done",
				arrival_time: "07:00",
			},
		}),
	]);

	// ============================================================================
	// Invoices
	// ============================================================================

	// INV-0001: Paid — AC repair (Johnson)
	const invoice1 = await db.invoice.create({
		data: {
			organization_id: org.id,
			invoice_number: "INV-0001",
			client_id: client1.id,
			status: "Paid",
			issue_date: daysFromNow(-2),
			due_date: daysFromNow(28),
			payment_terms_days: 30,
			paid_at: daysFromNow(-1),
			subtotal: 485.0,
			tax_rate: 0.0825,
			tax_amount: 40.01,
			total: 525.01,
			amount_paid: 525.01,
			balance_due: 0.0,
			memo: "Thank you for your business!",
			created_by_dispatcher_id: dispatcher.id,
			line_items: {
				create: [
					{
						source_visit_id: visit1.id,
						name: "Capacitor 45+5 MFD 440V",
						quantity: 1,
						unit_price: 85.0,
						total: 85.0,
						item_type: "material",
						sort_order: 0,
					},
					{
						source_visit_id: visit1.id,
						name: "Service Labor (2.5 hrs)",
						quantity: 2.5,
						unit_price: 160.0,
						total: 400.0,
						item_type: "labor",
						sort_order: 1,
					},
				],
			},
			jobs: { create: { job_id: job1.id, billed_amount: 525.01 } },
			visits: { create: { visit_id: visit1.id, billed_amount: 525.01 } },
		},
	});

	await db.invoice_payment.create({
		data: {
			invoice_id: invoice1.id,
			amount: 525.01,
			paid_at: daysFromNow(-1),
			method: "Check",
			note: "Check #4471 received from Robert Johnson.",
			recorded_by_dispatcher_id: dispatcher.id,
		},
	});

	await db.invoice_note.create({
		data: {
			organization_id: org.id,
			invoice_id: invoice1.id,
			content:
				"Payment received via check day after service. Customer very satisfied with the quick turnaround.",
			creator_dispatcher_id: dispatcher.id,
		},
	});

	// INV-0002: Draft — monthly PM (Williams)
	await db.invoice.create({
		data: {
			organization_id: org.id,
			invoice_number: "INV-0002",
			client_id: client3.id,
			recurring_plan_id: recurringPlan1.id,
			status: "Draft",
			issue_date: occurrencePastStart,
			due_date: new Date(
				occurrencePastStart.getTime() + 30 * 24 * 60 * 60 * 1000,
			),
			payment_terms_days: 30,
			subtotal: 534.0,
			tax_rate: 0.0825,
			tax_amount: 44.05,
			total: 578.05,
			amount_paid: 0.0,
			balance_due: 578.05,
			memo: "Monthly HVAC maintenance services — Williams Properties.",
			created_by_dispatcher_id: dispatcher.id,
			line_items: {
				create: [
					{
						source_visit_id: recurringVisit1.id,
						name: "PM Labor (4 hrs)",
						quantity: 4,
						unit_price: 125.0,
						total: 500.0,
						item_type: "labor",
						sort_order: 0,
					},
					{
						source_visit_id: recurringVisit1.id,
						name: "Air Filter 16x25x1 MERV-8 (4-pack)",
						quantity: 4,
						unit_price: 8.5,
						total: 34.0,
						item_type: "material",
						sort_order: 1,
					},
				],
			},
			jobs: { create: { job_id: job4.id, billed_amount: 578.05 } },
			visits: {
				create: { visit_id: recurringVisit1.id, billed_amount: 578.05 },
			},
		},
	});

	// INV-0003: Sent — equipment deposit for rooftop job (Smith)
	await db.invoice.create({
		data: {
			organization_id: org.id,
			invoice_number: "INV-0003",
			client_id: client2.id,
			status: "Sent",
			issue_date: daysFromNow(-3),
			due_date: daysFromNow(27),
			payment_terms_days: 30,
			sent_at: daysFromNow(-3),
			viewed_at: daysFromNow(-2),
			subtotal: 4800.0,
			tax_rate: 0.0825,
			tax_amount: 396.0,
			total: 5196.0,
			amount_paid: 0.0,
			balance_due: 5196.0,
			memo: "Equipment deposit — Carrier 48TCED06A2A5. Labor invoiced separately upon installation completion.",
			internal_notes:
				"Per contract terms: equipment cost billed upfront. Labor invoice to follow on job completion.",
			created_by_dispatcher_id: dispatcher.id,
			line_items: {
				create: [
					{
						source_job_id: job2.id,
						name: "Carrier 5-Ton Rooftop Unit 48TCED06A2A5 (Equipment Deposit)",
						quantity: 1,
						unit_price: 4800.0,
						total: 4800.0,
						item_type: "equipment",
						sort_order: 0,
					},
				],
			},
			jobs: { create: { job_id: job2.id, billed_amount: 5196.0 } },
		},
	});

	// INV-0004: PartiallyPaid — annual PM pre-billed (Anderson, tax exempt)
	const invoice4 = await db.invoice.create({
		data: {
			organization_id: org.id,
			invoice_number: "INV-0004",
			client_id: client4.id,
			status: "PartiallyPaid",
			issue_date: daysFromNow(-14),
			due_date: daysFromNow(16),
			payment_terms_days: 30,
			sent_at: daysFromNow(-14),
			subtotal: 1200.0,
			tax_rate: 0.0,
			tax_amount: 0.0,
			total: 1200.0,
			amount_paid: 600.0,
			balance_due: 600.0,
			memo: "Annual preventive maintenance — Anderson Office Complex.",
			created_by_dispatcher_id: dispatcher.id,
			line_items: {
				create: [
					{
						name: "Annual PM Labor (8 hrs)",
						quantity: 8,
						unit_price: 125.0,
						total: 1000.0,
						item_type: "labor",
						sort_order: 0,
					},
					{
						name: "MERV-13 Filter 20x25x2 (3-pack)",
						quantity: 2,
						unit_price: 45.0,
						total: 90.0,
						item_type: "material",
						sort_order: 1,
					},
					{
						name: "Miscellaneous Parts Allowance",
						quantity: 1,
						unit_price: 110.0,
						total: 110.0,
						item_type: "other",
						sort_order: 2,
					},
				],
			},
			jobs: { create: { job_id: job3.id, billed_amount: 1200.0 } },
			visits: { create: { visit_id: visit3.id, billed_amount: 1200.0 } },
		},
	});

	await db.invoice_payment.create({
		data: {
			invoice_id: invoice4.id,
			amount: 600.0,
			paid_at: daysFromNow(-7),
			method: "ACH",
			note: "First installment per payment arrangement with Michael Anderson.",
			recorded_by_dispatcher_id: dispatcher.id,
		},
	});

	await db.invoice_note.create({
		data: {
			organization_id: org.id,
			invoice_id: invoice4.id,
			content:
				"Anderson agreed to split into two $600 installments. Second payment due by end of month.",
			creator_dispatcher_id: dispatcher.id,
		},
	});

	// INV-0005: Void — emergency inspection that was cancelled (Riverside)
	await db.invoice.create({
		data: {
			organization_id: org.id,
			invoice_number: "INV-0005",
			client_id: client5.id,
			status: "Void",
			issue_date: daysFromNow(-5),
			due_date: daysFromNow(25),
			payment_terms_days: 30,
			voided_at: daysFromNow(-5),
			void_reason:
				"Job cancelled — gas company handled inspection. No billable work performed.",
			subtotal: 150.0,
			tax_rate: 0.0825,
			tax_amount: 12.38,
			total: 162.38,
			amount_paid: 0.0,
			balance_due: 0.0,
			created_by_dispatcher_id: dispatcher.id,
			line_items: {
				create: [
					{
						name: "Emergency Dispatch Fee",
						quantity: 1,
						unit_price: 150.0,
						total: 150.0,
						item_type: "other",
						sort_order: 0,
					},
				],
			},
		},
	});

	// ============================================================================
	// Form Drafts
	// ============================================================================

	await Promise.all([
		db.form_draft.create({
			data: {
				organization_id: org.id,
				form_type: "quote",
				label: "Q — Riverside Apts: Boiler Inspection & Tune-Up",
				entity_context_id: req4.id,
				payload: {
					title: "Boiler Inspection & Tune-Up — Riverside Apartments",
					client_id: client5.id,
					request_id: req4.id,
					description:
						"Full boiler inspection, combustion analysis, and safety check for heating season.",
					priority: "Medium",
					address: "1420 Rose St, La Crosse, WI 54603",
					tax_rate: 0.0825,
					line_items: [
						{
							name: "Boiler Inspection & Combustion Analysis",
							quantity: 1,
							unit_price: 195.0,
							item_type: "labor",
						},
						{
							name: "Tune-Up Kit (filters, gaskets, igniter)",
							quantity: 1,
							unit_price: 55.0,
							item_type: "material",
						},
					],
				},
			},
		}),
		db.form_draft.create({
			data: {
				organization_id: org.id,
				form_type: "job_visit",
				label: "Visit — J-0003: Final Commissioning",
				entity_context_id: job3.id,
				payload: {
					job_id: job3.id,
					name: "Final Commissioning & Customer Walkthrough",
					description:
						"Commission all repaired systems, verify operation with building manager, conduct walkthrough.",
					arrival_constraint: "at",
					finish_constraint: "when_done",
					arrival_time: "14:00",
					tech_ids: [tech1.id],
				},
			},
		}),
		db.form_draft.create({
			data: {
				organization_id: org.id,
				form_type: "invoice",
				label: "INV — Smith Commercial: J-0002 Labor Completion",
				entity_context_id: job2.id,
				payload: {
					client_id: client2.id,
					job_id: job2.id,
					memo: "Installation labor upon rooftop unit completion. Equipment billed separately on INV-0003.",
					payment_terms_days: 30,
					line_items: [
						{
							name: "Installation Labor (8 hrs)",
							quantity: 8,
							unit_price: 175.0,
							item_type: "labor",
						},
						{
							name: "Refrigerant R-410A (10 lbs)",
							quantity: 10,
							unit_price: 60.0,
							item_type: "material",
						},
					],
				},
			},
		}),
	]);

	// ============================================================================
	// Activity Logs  (populates the live activity feed on first load)
	// Each entry matches a FEED_EVENT type consumed by /logs/recent
	// ============================================================================

	const minsAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);
	const hrsAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

	await db.log.createMany({
		data: [
			// ── Requests ────────────────────────────────────────────────────────
			{
				organization_id: org.id,
				event_type: "request.created",
				action: "created",
				entity_type: "request",
				entity_id: req5.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					title: { old: null, new: "Duct Cleaning — Full House" },
					priority: { old: null, new: "Low" },
				},
				timestamp: hrsAgo(336),
			},
			{
				organization_id: org.id,
				event_type: "request.created",
				action: "created",
				entity_type: "request",
				entity_id: req2.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					title: { old: null, new: "Furnace Not Starting" },
					priority: { old: null, new: "Urgent" },
				},
				timestamp: hrsAgo(300),
			},
			{
				organization_id: org.id,
				event_type: "request.created",
				action: "created",
				entity_type: "request",
				entity_id: req1.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					title: { old: null, new: "AC Not Cooling" },
					priority: { old: null, new: "High" },
				},
				timestamp: hrsAgo(264),
			},
			{
				organization_id: org.id,
				event_type: "request.created",
				action: "created",
				entity_type: "request",
				entity_id: req4.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					title: {
						old: null,
						new: "Thermostat Replacement — Units 4, 8, 12",
					},
					priority: { old: null, new: "Medium" },
				},
				timestamp: hrsAgo(240),
			},
			// ── Quotes ──────────────────────────────────────────────────────────
			{
				organization_id: org.id,
				event_type: "quote.created",
				action: "created",
				entity_type: "quote",
				entity_id: quote1.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					quote_number: { old: null, new: "Q-0001" },
					title: {
						old: null,
						new: "Rooftop Unit Replacement — Bldg 2",
					},
					total: { old: null, new: 7361.0 },
				},
				timestamp: hrsAgo(228),
			},
			{
				organization_id: org.id,
				event_type: "quote.updated",
				action: "updated",
				entity_type: "quote",
				entity_id: quote1.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					status: { old: "Draft", new: "Sent" },
					_quote_number: { old: null, new: "Q-0001" },
				},
				timestamp: hrsAgo(216),
			},
			{
				organization_id: org.id,
				event_type: "quote.created",
				action: "created",
				entity_type: "quote",
				entity_id: quote2.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					quote_number: { old: null, new: "Q-0002" },
					title: {
						old: null,
						new: "Thermostat Replacement — Riverside Apts Units 4, 8, 12",
					},
					total: { old: null, new: 292.28 },
				},
				timestamp: hrsAgo(192),
			},
			{
				organization_id: org.id,
				event_type: "quote.updated",
				action: "updated",
				entity_type: "quote",
				entity_id: quote1.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					status: { old: "Sent", new: "Approved" },
					_quote_number: { old: null, new: "Q-0001" },
				},
				timestamp: hrsAgo(144),
			},
			// ── Recurring Plans ─────────────────────────────────────────────────
			{
				organization_id: org.id,
				event_type: "recurring_plan.created",
				action: "created",
				entity_type: "recurring_plan",
				entity_id: recurringPlan1.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					name: {
						old: null,
						new: "Monthly HVAC Maintenance — Williams Properties",
					},
				},
				timestamp: hrsAgo(192),
			},
			{
				organization_id: org.id,
				event_type: "recurring_plan.created",
				action: "created",
				entity_type: "recurring_plan",
				entity_id: recurringPlan2.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					name: {
						old: null,
						new: "Weekly Filter Checks — Anderson Office Complex",
					},
				},
				timestamp: hrsAgo(190),
			},
			// ── Jobs ────────────────────────────────────────────────────────────
			{
				organization_id: org.id,
				event_type: "job.created",
				action: "created",
				entity_type: "job",
				entity_id: job1.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					job_number: { old: null, new: "J-0001" },
					name: { old: null, new: "AC Repair — Johnson Residence" },
				},
				timestamp: hrsAgo(216),
			},
			{
				organization_id: org.id,
				event_type: "job.created",
				action: "created",
				entity_type: "job",
				entity_id: job2.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					job_number: { old: null, new: "J-0002" },
					name: {
						old: null,
						new: "Rooftop Unit Replacement — Smith Commercial Bldg 2",
					},
				},
				timestamp: hrsAgo(168),
			},
			{
				organization_id: org.id,
				event_type: "job.created",
				action: "created",
				entity_type: "job",
				entity_id: job3.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					job_number: { old: null, new: "J-0003" },
					name: {
						old: null,
						new: "Annual PM — Anderson Office Complex",
					},
				},
				timestamp: hrsAgo(167),
			},
			// ── Recurring occurrences ────────────────────────────────────────────
			{
				organization_id: org.id,
				event_type: "recurring_occurrence.generated",
				action: "created",
				entity_type: "recurring_plan",
				entity_id: recurringPlan1.id,
				actor_type: "system",
				actor_id: null,
				actor_name: "System",
				changes: { generated_count: { old: 0, new: 1 } },
				timestamp: hrsAgo(120),
			},
			{
				organization_id: org.id,
				event_type: "recurring_occurrence.generated",
				action: "created",
				entity_type: "recurring_plan",
				entity_id: recurringPlan2.id,
				actor_type: "system",
				actor_id: null,
				actor_name: "System",
				changes: { generated_count: { old: 0, new: 1 } },
				timestamp: hrsAgo(110),
			},
			// ── Visit lifecycle ──────────────────────────────────────────────────
			{
				organization_id: org.id,
				event_type: "job_visit.created",
				action: "created",
				entity_type: "job_visit",
				entity_id: recurringVisit1.id,
				actor_type: "system",
				actor_id: null,
				actor_name: "System",
				changes: {
					job_id: { old: null, new: job4.id },
					_job_number: { old: null, new: "J-0004" },
					name: {
						old: null,
						new: "Monthly PM — Williams Properties",
					},
					scheduled_start_at: {
						old: null,
						new: occurrencePastStart.toISOString(),
					},
				},
				timestamp: hrsAgo(120),
			},
			{
				organization_id: org.id,
				event_type: "job_visit.technicians_assigned",
				action: "updated",
				entity_type: "job_visit",
				entity_id: recurringVisit1.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					technicians: { old: [], new: [tech1.name] },
					_job_id: { old: null, new: job4.id },
					_job_number: { old: null, new: "J-0004" },
				},
				timestamp: hrsAgo(119),
			},
			{
				organization_id: org.id,
				event_type: "job_visit.created",
				action: "created",
				entity_type: "job_visit",
				entity_id: visit1.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					job_id: { old: null, new: job1.id },
					_job_number: { old: null, new: "J-0001" },
					name: { old: null, new: "AC Diagnosis & Repair" },
					scheduled_start_at: {
						old: null,
						new: dateAt(yesterday, 9).toISOString(),
					},
				},
				timestamp: hrsAgo(48),
			},
			{
				organization_id: org.id,
				event_type: "job_visit.technicians_assigned",
				action: "updated",
				entity_type: "job_visit",
				entity_id: visit1.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					technicians: { old: [], new: [tech2.name] },
					_job_id: { old: null, new: job1.id },
					_job_number: { old: null, new: "J-0001" },
				},
				timestamp: hrsAgo(47),
			},
			{
				organization_id: org.id,
				event_type: "job_visit.updated",
				action: "updated",
				entity_type: "job_visit",
				entity_id: visit1.id,
				actor_type: "technician",
				actor_id: tech2.id,
				actor_name: tech2.name,
				changes: {
					status: { old: "Scheduled", new: "Driving" },
					_job_id: { old: null, new: job1.id },
					_job_number: { old: null, new: "J-0001" },
				},
				timestamp: hrsAgo(35),
			},
			{
				organization_id: org.id,
				event_type: "job_visit.updated",
				action: "updated",
				entity_type: "job_visit",
				entity_id: visit1.id,
				actor_type: "technician",
				actor_id: tech2.id,
				actor_name: tech2.name,
				changes: {
					status: { old: "Driving", new: "OnSite" },
					_job_id: { old: null, new: job1.id },
					_job_number: { old: null, new: "J-0001" },
				},
				timestamp: hrsAgo(34),
			},
			{
				organization_id: org.id,
				event_type: "job_visit.updated",
				action: "updated",
				entity_type: "job_visit",
				entity_id: visit1.id,
				actor_type: "technician",
				actor_id: tech2.id,
				actor_name: tech2.name,
				changes: {
					status: { old: "OnSite", new: "InProgress" },
					_job_id: { old: null, new: job1.id },
					_job_number: { old: null, new: "J-0001" },
				},
				timestamp: hrsAgo(34),
			},
			{
				organization_id: org.id,
				event_type: "job_visit.updated",
				action: "updated",
				entity_type: "job_visit",
				entity_id: visit1.id,
				actor_type: "technician",
				actor_id: tech2.id,
				actor_name: tech2.name,
				changes: {
					status: { old: "InProgress", new: "Completed" },
					_job_id: { old: null, new: job1.id },
					_job_number: { old: null, new: "J-0001" },
				},
				timestamp: hrsAgo(32),
			},
			{
				organization_id: org.id,
				event_type: "job_visit.created",
				action: "created",
				entity_type: "job_visit",
				entity_id: visit2.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					job_id: { old: null, new: job2.id },
					_job_number: { old: null, new: "J-0002" },
					name: {
						old: null,
						new: "Equipment Removal & Installation",
					},
					scheduled_start_at: {
						old: null,
						new: dateAt(today, 7).toISOString(),
					},
				},
				timestamp: hrsAgo(24),
			},
			{
				organization_id: org.id,
				event_type: "job_visit.technicians_assigned",
				action: "updated",
				entity_type: "job_visit",
				entity_id: visit2.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					technicians: { old: [], new: [tech1.name, tech2.name] },
					_job_id: { old: null, new: job2.id },
					_job_number: { old: null, new: "J-0002" },
				},
				timestamp: hrsAgo(23),
			},
			{
				organization_id: org.id,
				event_type: "job_visit.updated",
				action: "updated",
				entity_type: "job_visit",
				entity_id: visit2.id,
				actor_type: "technician",
				actor_id: tech1.id,
				actor_name: tech1.name,
				changes: {
					status: { old: "Scheduled", new: "Driving" },
					_job_id: { old: null, new: job2.id },
					_job_number: { old: null, new: "J-0002" },
				},
				timestamp: hrsAgo(5),
			},
			{
				organization_id: org.id,
				event_type: "job_visit.updated",
				action: "updated",
				entity_type: "job_visit",
				entity_id: visit2.id,
				actor_type: "technician",
				actor_id: tech1.id,
				actor_name: tech1.name,
				changes: {
					status: { old: "Driving", new: "OnSite" },
					_job_id: { old: null, new: job2.id },
					_job_number: { old: null, new: "J-0002" },
				},
				timestamp: hrsAgo(4),
			},
			{
				organization_id: org.id,
				event_type: "job_visit.created",
				action: "created",
				entity_type: "job_visit",
				entity_id: visit7.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					job_id: { old: null, new: job3.id },
					_job_number: { old: null, new: "J-0003" },
					name: { old: null, new: "Pre-Inspection Site Survey" },
					scheduled_start_at: {
						old: null,
						new: dateAt(today, 10).toISOString(),
					},
				},
				timestamp: hrsAgo(3),
			},
			{
				organization_id: org.id,
				event_type: "job_visit.updated",
				action: "updated",
				entity_type: "job_visit",
				entity_id: visit7.id,
				actor_type: "technician",
				actor_id: tech3.id,
				actor_name: tech3.name,
				changes: {
					status: { old: "Scheduled", new: "Driving" },
					_job_id: { old: null, new: job3.id },
					_job_number: { old: null, new: "J-0003" },
				},
				timestamp: minsAgo(45),
			},
			{
				organization_id: org.id,
				event_type: "job_visit.updated",
				action: "updated",
				entity_type: "job_visit",
				entity_id: visit8.id,
				actor_type: "technician",
				actor_id: tech1.id,
				actor_name: tech1.name,
				changes: {
					status: { old: "InProgress", new: "Paused" },
					_job_id: { old: null, new: job4.id },
					_job_number: { old: null, new: "J-0004" },
				},
				timestamp: minsAgo(20),
			},
			// ── Invoices ─────────────────────────────────────────────────────────
			{
				organization_id: org.id,
				event_type: "invoice.created",
				action: "created",
				entity_type: "invoice",
				entity_id: invoice1.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					invoice_number: { old: null, new: "INV-0001" },
					total: { old: null, new: 525.01 },
				},
				timestamp: hrsAgo(30),
			},
			{
				organization_id: org.id,
				event_type: "invoice.updated",
				action: "updated",
				entity_type: "invoice",
				entity_id: invoice1.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					status: { old: "Draft", new: "Sent" },
					_invoice_number: { old: null, new: "INV-0001" },
				},
				timestamp: hrsAgo(24),
			},
			{
				organization_id: org.id,
				event_type: "invoice_payment.created",
				action: "created",
				entity_type: "invoice_payment",
				entity_id: invoice1.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					_invoice_number: { old: null, new: "INV-0001" },
					amount: { old: null, new: 525.01 },
					method: { old: null, new: "Check" },
				},
				timestamp: hrsAgo(8),
			},
			{
				organization_id: org.id,
				event_type: "invoice.updated",
				action: "updated",
				entity_type: "invoice",
				entity_id: invoice1.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					status: { old: "Sent", new: "Paid" },
					_invoice_number: { old: null, new: "INV-0001" },
				},
				timestamp: hrsAgo(8),
			},
			{
				organization_id: org.id,
				event_type: "invoice.created",
				action: "created",
				entity_type: "invoice",
				entity_id: invoice4.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					invoice_number: { old: null, new: "INV-0004" },
					total: { old: null, new: 1200.0 },
				},
				timestamp: hrsAgo(336),
			},
			{
				organization_id: org.id,
				event_type: "invoice.updated",
				action: "updated",
				entity_type: "invoice",
				entity_id: invoice4.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					status: { old: "Draft", new: "Sent" },
					_invoice_number: { old: null, new: "INV-0004" },
				},
				timestamp: hrsAgo(335),
			},
			{
				organization_id: org.id,
				event_type: "invoice_payment.created",
				action: "created",
				entity_type: "invoice_payment",
				entity_id: invoice4.id,
				actor_type: "dispatcher",
				actor_id: dispatcher.id,
				actor_name: dispatcher.name,
				changes: {
					_invoice_number: { old: null, new: "INV-0004" },
					amount: { old: null, new: 600.0 },
					method: { old: null, new: "ACH" },
				},
				timestamp: hrsAgo(168),
			},
		],
	});

	console.log("Seeded successfully:");
	console.log(`  Organization:      ${org.name}`);
	console.log(`  Dispatcher:        ${dispatcher.email} / password123`);
	console.log(
		`  Technicians:       ${tech1.email}, ${tech2.email}, ${tech3.email} / password123`,
	);
	console.log(`  Clients:           5  (with contacts & notes)`);
	console.log(`  Contacts:          6`);
	console.log(
		`  Requests:          5  ConvertedToJob, Quoted, New, Reviewing, Cancelled`,
	);
	console.log(
		`  Quotes:            2  Q-0001 Approved, Q-0002 Draft (with discount)`,
	);
	console.log(
		`  Recurring Plans:   2  monthly (Williams) + weekly (Anderson, with weekday rule)`,
	);
	console.log(
		`  Invoice Schedules: 2  on_visit_completion + monthly subscription`,
	);
	console.log(
		`  Jobs:              6  Completed, InProgress, Scheduled, InProgress×2, Cancelled`,
	);
	console.log(
		`  Visits:            8  Completed, OnSite, Scheduled, Completed×2, Scheduled, Driving, Paused`,
	);
	console.log(
		`  Occurrences:       5  skipped, completed×2, planned, generated`,
	);
	console.log(
		`  Invoices:          5  Paid, Draft, Sent, PartiallyPaid, Void`,
	);
	console.log(`  Payments:          2  full (check) + partial (ACH)`);
	console.log(`  Form Drafts:       3  quote, job_visit, invoice`);
	console.log(`  Inventory:         5 items (2 below low-stock threshold)`);
	console.log(
		`  Activity Logs:     37 entries covering all feed event types`,
	);
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e);
		await db.$disconnect();
		process.exit(1);
	});
