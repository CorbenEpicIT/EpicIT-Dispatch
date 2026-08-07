/// <reference types="node" />
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import bcryptjs from "bcryptjs";
import crypto from "crypto";
import { getAllPermissions } from "../src/lib/permissionCatalogs.js";
import { recordMovements, getOrCreateBatch, shortCode } from "../src/services/stockMovements.js";
import {
	calculateDocumentTax,
	centsToDollars,
	type TaxGroupConfig,
	type LineItemTaxInput,
} from "../src/services/taxEngine.js";

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
	// OAuth2 Server — Zapier client (dev/local)
	// ============================================================================

	await db.oauth_client.create({
		data: {
			client_id: "zapier-1cb47faa2f6b213d",
			client_secret: crypto
				.createHash("sha256")
				.update("7XzU2_BJwx8fKlBl68eu5VCgnBEdRTO8D1ej0POlaoE")
				.digest("hex"),
			name: "Zapier (local test)",
			redirect_uris: [
				"http://localhost:3000/oauth/callback-test",
				"http://localhost:9000", // `zapier invoke auth start` loopback catcher
				"https://zapier.com/dashboard/auth/oauth/return/App243204CLIAPI/",
			],
			is_confidential: true,
		},
	});

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
			restock_mode: "tech_self_serve",
		},
	});

	// ============================================================================
	// Tax System — rates + group (sum to 0.0825 so existing totals stay consistent)
	// ============================================================================

	const [taxStateRate, taxCountyRate] = await Promise.all([
		db.tax_rate.create({
			data: {
				organization_id: org.id,
				name: "WI State Sales Tax",
				rate: 0.0625,
				jurisdiction: "State",
				description: "Wisconsin state sales & use tax.",
				is_default: false,
				is_active: true,
			},
		}),
		db.tax_rate.create({
			data: {
				organization_id: org.id,
				name: "La Crosse County / City",
				rate: 0.02,
				jurisdiction: "County",
				description: "Combined county and city sales tax.",
				is_default: false,
				is_active: true,
			},
		}),
	]);

	const taxGroup = await db.tax_group.create({
		data: {
			organization_id: org.id,
			name: "WI Standard",
			description: "Standard Wisconsin sales tax (state + county/city).",
			is_default: true,
			is_active: true,
			rates: {
				create: [
					{ tax_rate_id: taxStateRate.id, sort_order: 0 },
					{ tax_rate_id: taxCountyRate.id, sort_order: 1 },
				],
			},
		},
	});

	// In-memory config for the centralized tax engine (mirrors taxEngine.TaxGroupConfig)
	const taxGroupConfig: TaxGroupConfig = {
		id: taxGroup.id,
		name: taxGroup.name,
		rates: [
			{ id: taxStateRate.id, name: taxStateRate.name, rate: 0.0625, jurisdiction: "State" },
			{ id: taxCountyRate.id, name: taxCountyRate.name, rate: 0.02, jurisdiction: "County" },
		],
	};

	// ============================================================================
	// Organization Roles
	// ============================================================================

	const adminRole = await db.organization_role.create({
		data: {
			organization_id: org.id,
			name: "Administrator",
			base_tier: "dispatcher",
			permissions: getAllPermissions("dispatcher"),
			is_default: false,
		},
	});

	const [dispatcherRole, technicianRole] = await Promise.all([
		db.organization_role.create({
			data: {
				organization_id: org.id,
				name: "Default Dispatcher",
				base_tier: "dispatcher",
				permissions: getAllPermissions("dispatcher").filter(
					(p) => p !== "manage_roles" && p !== "view_admin" && p !== "manage_organization" && p !== "manage_dispatchers"
				),
				is_default: true,
			},
		}),
		db.organization_role.create({
			data: {
				organization_id: org.id,
				name: "Default Technician",
				base_tier: "technician",
				permissions: getAllPermissions("technician"),
				is_default: true,
			},
		}),
	]);

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
			last_login: new Date(),
			role: "admin",
			organization_role_id: adminRole.id,
		},
	});

	const dispatcher2 = await db.dispatcher.create({
		data: {
			organization_id: org.id,
			name: "Sam Torres",
			email: "dispatcher@epichvac.com",
			phone: "6082550199",
			password: dispatcherPassword,
			title: "Dispatcher",
			description: "Test dispatcher account.",
			email_verified_at: new Date(),
			email_verification_token: null,
			last_login: new Date(),
			role: "dispatcher",
			organization_role_id: dispatcherRole.id,
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
				last_login: new Date(),
				organization_role_id: technicianRole.id,
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
				status: "Working",
				hire_date: new Date("2020-07-01"),
				coords: { lat: 43.8129, lng: -91.2559 },
				hourly_rate: 75.00,
				organization_role_id: technicianRole.id,
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
				organization_role_id: technicianRole.id,
			},
		}),
	]);

	// ============================================================================
	// Inventory — created early so visits can reference inventory_item_id
	// ============================================================================

	// NOTE: All inventory starts at quantity 0. Warehouse on-hand is established
	// exclusively through recordMovements() ("receive") later in this seed, so the
	// stock_movement ledger and the cached quantity columns always reconcile.
	const [
		invRefrigerant,
		invFilter,
		invCapacitor,
		invThermostat,
		invContactor,
		invBlower,
		invIgniter,
		invFlameSensor,
		invCondPump,
		invLineSet,
		invCompressor,
	] = await Promise.all([
		db.inventory_item.create({
			data: {
				organization_id: org.id,
				name: "Refrigerant R-410A (25 lb cylinder)",
				description:
					"Standard residential/light commercial refrigerant.",
				location: "Warehouse — Shelf A1",
				quantity: 0,
				unit_price: 60.0,
				cost: 38.0,
				sku: "REF-410A-25",
				barcode: shortCode("ITM"),
				alt_ids: ["R410A-25LB", "NU-410A"],
				low_stock_threshold: 3,
				category: "Refrigerants",
				unit: "cylinder",
				is_batch_tracked: true,
			},
		}),
		db.inventory_item.create({
			data: {
				organization_id: org.id,
				name: "Air Filter 16x25x1 MERV-8",
				description:
					"Standard replacement filter for residential split systems.",
				location: "Warehouse — Shelf B3",
				quantity: 0,
				unit_price: 8.5,
				cost: 3.25,
				sku: "FILT-16251-M8",
				barcode: shortCode("ITM"),
				alt_ids: ["16x25x1-M8", "AF-1625-8"],
				low_stock_threshold: 12,
				category: "Filters",
				unit: "each",
			},
		}),
		db.inventory_item.create({
			data: {
				organization_id: org.id,
				name: "Capacitor 45+5 MFD 440V Round",
				description:
					"Dual run capacitor for condenser fan and compressor.",
				location: "Parts Room — Bin C7",
				quantity: 0,
				unit_price: 22.0,
				cost: 8.5,
				sku: "CAP-45-5-440",
				barcode: shortCode("ITM"),
				alt_ids: ["97F9895", "TRCFD455"],
				low_stock_threshold: 5,
				category: "Electrical",
				unit: "each",
			},
		}),
		db.inventory_item.create({
			data: {
				organization_id: org.id,
				name: "Honeywell T6 Pro Programmable Thermostat",
				description:
					"7-day programmable thermostat, universal compatibility.",
				location: "Parts Room — Bin D2",
				quantity: 0,
				unit_price: 65.0,
				cost: 32.0,
				sku: "TSTAT-T6PRO",
				alt_ids: ["TH6220WF2006", "T6-PRO"],
				low_stock_threshold: 2,
				category: "Controls",
				unit: "each",
			},
		}),
		db.inventory_item.create({
			data: {
				organization_id: org.id,
				name: "Contactor 2-Pole 40A 24V",
				description:
					"Replacement contactor for condenser units up to 5 tons.",
				location: "Parts Room — Bin C8",
				quantity: 0,
				unit_price: 28.0,
				cost: 11.0,
				sku: "CONT-2P-40A",
				alt_ids: ["42-25101-01", "C240B"],
				low_stock_threshold: 4,
				category: "Electrical",
				unit: "each",
			},
		}),
		db.inventory_item.create({
			data: {
				organization_id: org.id,
				name: "Blower Motor 1/2 HP 115V",
				description:
					"Direct-drive PSC blower motor, 1075 RPM, 4-speed.",
				location: "Warehouse — Shelf A4",
				quantity: 0,
				unit_price: 185.0,
				cost: 96.0,
				sku: "MOT-BLW-12HP",
				barcode: shortCode("ITM"),
				alt_ids: ["FM-BL-0500", "5KCP39"],
				low_stock_threshold: 2,
				category: "Motors",
				unit: "each",
				is_serialized: true,
			},
		}),
		db.inventory_item.create({
			data: {
				organization_id: org.id,
				name: "Hot Surface Igniter (Universal)",
				description:
					"Universal silicon nitride hot surface igniter with mounting kit.",
				location: "Parts Room — Bin D5",
				quantity: 0,
				unit_price: 42.0,
				cost: 18.5,
				sku: "IGN-HSI-UNIV",
				alt_ids: ["IG1100", "271N"],
				low_stock_threshold: 3,
				category: "Controls",
				unit: "each",
			},
		}),
		db.inventory_item.create({
			data: {
				organization_id: org.id,
				name: "Flame Sensor (Universal Rod)",
				description:
					"Universal flame sensor rod for gas furnace ignition systems.",
				location: "Parts Room — Bin D6",
				quantity: 0,
				unit_price: 14.0,
				cost: 4.75,
				sku: "SEN-FLAME-U",
				alt_ids: ["LH680534", "FS-UNIV"],
				low_stock_threshold: 4,
				category: "Controls",
				unit: "each",
			},
		}),
		db.inventory_item.create({
			data: {
				organization_id: org.id,
				name: "Condensate Pump 120V",
				description:
					"Automatic condensate removal pump, 1/30 HP, 20 ft lift.",
				location: "Warehouse — Shelf B6",
				quantity: 0,
				unit_price: 78.0,
				cost: 41.0,
				sku: "PMP-COND-120",
				alt_ids: ["VCMA-20ULS", "CP-2000"],
				low_stock_threshold: 2,
				category: "Plumbing",
				unit: "each",
			},
		}),
		db.inventory_item.create({
			data: {
				organization_id: org.id,
				name: "Copper Line Set 3/8 x 3/4",
				description:
					"Insulated copper refrigerant line set, sold by the foot.",
				location: "Warehouse — Rack C1",
				quantity: 0,
				unit_price: 6.5,
				cost: 3.1,
				sku: "LINE-38-34",
				alt_ids: ["LS-3834", "CU-LINESET"],
				low_stock_threshold: 20,
				category: "Refrigerants",
				unit: "ft",
			},
		}),
		db.inventory_item.create({
			data: {
				organization_id: org.id,
				name: "Compressor 3-Ton Scroll R410A",
				description:
					"Copeland scroll compressor for 3-ton split systems. Serialized for warranty tracking and lot-tracked for defect recalls.",
				location: "Warehouse — Shelf A2",
				quantity: 0,
				unit_price: 620.0,
				cost: 410.0,
				sku: "COMP-3T-SCRL",
				barcode: shortCode("ITM"),
				alt_ids: ["ZP31K5E-PFV", "CMP-3T-SCRL"],
				low_stock_threshold: 1,
				category: "Compressors",
				unit: "each",
				is_serialized: true,
				is_batch_tracked: true,
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
				tax_group_id: taxGroup.id,
			},
		}),
		db.client.create({
			data: {
				organization_id: org.id,
				name: "Smith Commercial Properties",
				address: "401 Main St, La Crosse, WI 54601",
				coords: { lat: 43.8129, lng: -91.2559 },
				is_tax_exempt: false,
				tax_group_id: taxGroup.id,
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
			coords: { lat: 43.7889, lng: -91.2297 },
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
			coords: { lat: 43.8334, lng: -91.2601 },
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
	// Projects — created before Jobs so job rows can set project_id directly.
	// Covers every project_status and priority value, plus an unassigned manager
	// so the projects report's "By Manager" breakdown has an Unassigned bucket.
	// Budgets are sized against the attached job totals below: P-0001/P-0002 land
	// around 75-80% spent, P-0004 finishes slightly over, P-0005 sits at ~98%.
	// ============================================================================

	const [
		project1,
		project2,
		project3,
		project4,
		project5,
		project6,
	] = await Promise.all([
		// P-0001: Active — multi-building rooftop replacement (Smith)
		db.project.create({
			data: {
				organization_id: org.id,
				project_number: "P-0001",
				name: "Rooftop Unit Replacement Program — Smith Commercial",
				description:
					"Phased replacement of the aging rooftop package units across all three buildings. Bldg 1 complete, Bldg 2 in progress, Bldg 3 pending curb fabrication.",
				status: "Active",
				priority: "High",
				address: client2.address,
				coords: { lat: 43.8129, lng: -91.2559 },
				client_id: client2.id,
				manager_dispatcher_id: dispatcher.id,
				budget: 24000.0,
				starts_at: daysFromNow(-42),
				target_end_at: daysFromNow(38),
			},
		}),
		// P-0002: Active — annual maintenance + retrofit program (Anderson, tax exempt)
		db.project.create({
			data: {
				organization_id: org.id,
				project_number: "P-0002",
				name: "Annual Maintenance Program — Anderson Office Complex",
				description:
					"Umbrella project for the FY26 maintenance contract: seasonal PM on all rooftop units plus the floor-by-floor VAV control retrofit.",
				status: "Active",
				priority: "Medium",
				address: client4.address,
				coords: { lat: 43.8334, lng: -91.2601 },
				client_id: client4.id,
				manager_dispatcher_id: dispatcher2.id,
				budget: 6000.0,
				starts_at: daysFromNow(-70),
				target_end_at: daysFromNow(120),
			},
		}),
		// P-0003: Planning — boiler plant replacement (Riverside)
		db.project.create({
			data: {
				organization_id: org.id,
				project_number: "P-0003",
				name: "Boiler Plant Replacement — Riverside Apartments",
				description:
					"Full replacement of both aging boilers after the emergency inspection call. Scoping and abatement survey underway; tenant notice required before demolition.",
				status: "Planning",
				priority: "Emergency",
				address: client5.address,
				coords: { lat: 43.8198, lng: -91.2514 },
				client_id: client5.id,
				manager_dispatcher_id: dispatcher.id,
				budget: 32000.0,
				starts_at: daysFromNow(-5),
				target_end_at: daysFromNow(95),
			},
		}),
		// P-0004: Completed — small fleet upgrade that ran slightly over budget
		db.project.create({
			data: {
				organization_id: org.id,
				project_number: "P-0004",
				name: "Thermostat Fleet Upgrade — Williams Property Management",
				description:
					"Programmable thermostat rollout across the managed units, with schedule handover to the property team. Came in just over budget after a second unit needed rewiring.",
				status: "Completed",
				priority: "Low",
				address: client3.address,
				coords: { lat: 43.7889, lng: -91.2297 },
				client_id: client3.id,
				manager_dispatcher_id: dispatcher2.id,
				budget: 750.0,
				starts_at: daysFromNow(-48),
				target_end_at: daysFromNow(-28),
				completed_at: daysFromNow(-30),
			},
		}),
		// P-0005: OnHold — awaiting homeowner financing (Johnson)
		db.project.create({
			data: {
				organization_id: org.id,
				project_number: "P-0005",
				name: "Whole-Home System Replacement — Johnson Residence",
				description:
					"Heat pump and air handler changeout quoted after the capacitor repair. On hold while the homeowner finalizes financing.",
				status: "OnHold",
				priority: "Medium",
				address: client1.address,
				coords: { lat: 43.8124, lng: -91.2568 },
				client_id: client1.id,
				manager_dispatcher_id: dispatcher.id,
				budget: 11000.0,
				starts_at: daysFromNow(-12),
				target_end_at: daysFromNow(60),
			},
		}),
		// P-0006: Cancelled — never got past scoping, no jobs attached
		db.project.create({
			data: {
				organization_id: org.id,
				project_number: "P-0006",
				name: "Chiller Plant Modernization — Smith Commercial",
				description:
					"Chiller plant modernization with new controls and commissioning. Cancelled before any work orders were written.",
				status: "Cancelled",
				priority: "Urgent",
				address: client2.address,
				coords: { lat: 43.8129, lng: -91.2559 },
				client_id: client2.id,
				manager_dispatcher_id: null,
				budget: 48000.0,
				starts_at: daysFromNow(-20),
				target_end_at: daysFromNow(150),
				cancelled_at: daysFromNow(-8),
				cancellation_reason:
					"Owner deferred the capital project to the next budget cycle.",
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
				project_id: project1.id,
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
				project_id: project2.id,
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
				project_id: project3.id,
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

	// ----------------------------------------------------------------------------
	// Project work orders — additional jobs rolled up under the projects above, so
	// each project has a populated jobs list and a meaningful spend-vs-budget bar.
	// Completed jobs carry actual_total, everything else carries estimated_total
	// (the tax post-pass at the end of this file recomputes both from line items).
	// ----------------------------------------------------------------------------

	await Promise.all([
		// J-0007: Completed — P-0001 phase one (Smith Bldg 1)
		db.job.create({
			data: {
				organization_id: org.id,
				job_number: "J-0007",
				name: "Rooftop Unit Replacement — Smith Commercial Bldg 1",
				description:
					"Phase one of the replacement program: swap the Bldg 1 rooftop package unit and recommission.",
				priority: "High",
				address: client2.address,
				coords: { lat: 43.8129, lng: -91.2559 },
				status: "Completed",
				client_id: client2.id,
				project_id: project1.id,
				subtotal: 7450.0,
				tax_rate: 0.0825,
				tax_amount: 614.63,
				actual_total: 8064.63,
				completed_at: daysFromNow(-18),
				line_items: {
					create: [
						{
							name: "Carrier 5-Ton Rooftop Unit 48TCED06A2A5",
							quantity: 1,
							unit_price: 4800.0,
							total: 4800.0,
							source: "manual",
							item_type: "equipment",
						},
						{
							name: "Installation Labor",
							quantity: 8,
							unit_price: 175.0,
							total: 1400.0,
							source: "manual",
							item_type: "labor",
						},
						{
							name: "Crane Rental (half day)",
							quantity: 1,
							unit_price: 650.0,
							total: 650.0,
							source: "manual",
							item_type: "other",
						},
						{
							name: "Refrigerant R-410A (10 lbs)",
							quantity: 10,
							unit_price: 60.0,
							total: 600.0,
							source: "manual",
							item_type: "material",
						},
					],
				},
			},
		}),
		// J-0008: Scheduled — P-0001 phase three, blocked on fabrication
		db.job.create({
			data: {
				organization_id: org.id,
				job_number: "J-0008",
				name: "Rooftop Curb Adapter Fabrication — Smith Commercial Bldg 3",
				description:
					"Fabricate and set the custom curb adapter so the Bldg 3 unit can drop onto the existing opening.",
				priority: "Medium",
				address: client2.address,
				coords: { lat: 43.8129, lng: -91.2559 },
				status: "Scheduled",
				client_id: client2.id,
				project_id: project1.id,
				subtotal: 2840.0,
				tax_rate: 0.0825,
				tax_amount: 234.3,
				estimated_total: 3074.3,
				line_items: {
					create: [
						{
							name: "Custom Curb Adapter (fabricated)",
							quantity: 1,
							unit_price: 1850.0,
							total: 1850.0,
							source: "manual",
							item_type: "equipment",
						},
						{
							name: "Fabrication & Set Labor",
							quantity: 6,
							unit_price: 165.0,
							total: 990.0,
							source: "manual",
							item_type: "labor",
						},
					],
				},
			},
		}),
		// J-0009: Completed — P-0002 VAV retrofit (Anderson is tax exempt → rate 0)
		db.job.create({
			data: {
				organization_id: org.id,
				job_number: "J-0009",
				name: "VAV Box Retrofit — Anderson Office Complex Floor 2",
				description:
					"Replace pneumatic VAV controls with DDC controllers on floor 2; point-to-point checkout with the BAS.",
				priority: "Medium",
				address: client4.address,
				coords: { lat: 43.8334, lng: -91.2601 },
				status: "Completed",
				client_id: client4.id,
				project_id: project2.id,
				subtotal: 3508.0,
				tax_rate: 0.0,
				tax_amount: 0.0,
				actual_total: 3508.0,
				completed_at: daysFromNow(-9),
				line_items: {
					create: [
						{
							name: "DDC Controller",
							quantity: 3,
							unit_price: 520.0,
							total: 1560.0,
							source: "manual",
							item_type: "equipment",
						},
						{
							name: "Control Wire (500ft spool)",
							quantity: 1,
							unit_price: 88.0,
							total: 88.0,
							source: "manual",
							item_type: "material",
						},
						{
							name: "Install & Commissioning Labor",
							quantity: 12,
							unit_price: 155.0,
							total: 1860.0,
							source: "manual",
							item_type: "labor",
						},
					],
				},
			},
		}),
		// J-0010: Unscheduled — P-0003 demolition, waiting on the abatement survey
		db.job.create({
			data: {
				organization_id: org.id,
				job_number: "J-0010",
				name: "Boiler Removal & Disposal — Riverside Apartments",
				description:
					"Demolish and haul off both existing boilers once the abatement survey clears the pipe insulation.",
				priority: "Urgent",
				address: client5.address,
				coords: { lat: 43.8198, lng: -91.2514 },
				status: "Unscheduled",
				client_id: client5.id,
				project_id: project3.id,
				subtotal: 3995.0,
				tax_rate: 0.0825,
				tax_amount: 329.59,
				estimated_total: 4324.59,
				line_items: {
					create: [
						{
							name: "Demolition Labor",
							quantity: 16,
							unit_price: 160.0,
							total: 2560.0,
							source: "manual",
							item_type: "labor",
						},
						{
							name: "Asbestos Abatement Survey",
							quantity: 1,
							unit_price: 950.0,
							total: 950.0,
							source: "manual",
							item_type: "other",
						},
						{
							name: "Disposal & Haul-Off",
							quantity: 1,
							unit_price: 485.0,
							total: 485.0,
							source: "manual",
							item_type: "other",
						},
					],
				},
			},
		}),
		// J-0011: Completed — P-0004 unit 4
		db.job.create({
			data: {
				organization_id: org.id,
				job_number: "J-0011",
				name: "Thermostat Replacement — Williams Unit 4",
				description:
					"Swap the failed thermostat for a programmable model and commission the schedule.",
				priority: "Low",
				address: client3.address,
				coords: { lat: 43.7889, lng: -91.2297 },
				status: "Completed",
				client_id: client3.id,
				project_id: project4.id,
				subtotal: 406.5,
				tax_rate: 0.0825,
				tax_amount: 33.54,
				actual_total: 440.04,
				completed_at: daysFromNow(-34),
				line_items: {
					create: [
						{
							name: "Programmable Thermostat",
							quantity: 1,
							unit_price: 189.0,
							total: 189.0,
							source: "manual",
							item_type: "equipment",
						},
						{
							name: "Service Labor (1.5 hrs)",
							quantity: 1.5,
							unit_price: 145.0,
							total: 217.5,
							source: "manual",
							item_type: "labor",
						},
					],
				},
			},
		}),
		// J-0012: Completed — P-0004 unit 9, the rewire that pushed it over budget
		db.job.create({
			data: {
				organization_id: org.id,
				job_number: "J-0012",
				name: "Thermostat Replacement — Williams Unit 9",
				description:
					"Thermostat swap plus a low-voltage rewire — the original run was spliced and unusable.",
				priority: "Low",
				address: client3.address,
				coords: { lat: 43.7889, lng: -91.2297 },
				status: "Completed",
				client_id: client3.id,
				project_id: project4.id,
				subtotal: 406.5,
				tax_rate: 0.0825,
				tax_amount: 33.54,
				actual_total: 440.04,
				completed_at: daysFromNow(-31),
				line_items: {
					create: [
						{
							name: "Programmable Thermostat",
							quantity: 1,
							unit_price: 189.0,
							total: 189.0,
							source: "manual",
							item_type: "equipment",
						},
						{
							name: "Service Labor (1.5 hrs)",
							quantity: 1.5,
							unit_price: 145.0,
							total: 217.5,
							source: "field_addition",
							item_type: "labor",
						},
					],
				},
			},
		}),
		// J-0013: Unscheduled — P-0005, the changeout the homeowner has on hold
		db.job.create({
			data: {
				organization_id: org.id,
				job_number: "J-0013",
				name: "Heat Pump & Air Handler Changeout — Johnson Residence",
				description:
					"Replace the aging split system with a 3-ton heat pump and matched air handler; new line set and pad.",
				priority: "Medium",
				address: client1.address,
				coords: { lat: 43.8124, lng: -91.2568 },
				status: "Unscheduled",
				client_id: client1.id,
				project_id: project5.id,
				subtotal: 9955.0,
				tax_rate: 0.0825,
				tax_amount: 821.29,
				estimated_total: 10776.29,
				line_items: {
					create: [
						{
							name: "Trane 3-Ton Heat Pump XR15",
							quantity: 1,
							unit_price: 5400.0,
							total: 5400.0,
							source: "manual",
							item_type: "equipment",
						},
						{
							name: "Air Handler w/ Matched Coil",
							quantity: 1,
							unit_price: 1980.0,
							total: 1980.0,
							source: "manual",
							item_type: "equipment",
						},
						{
							name: "Installation Labor",
							quantity: 14,
							unit_price: 165.0,
							total: 2310.0,
							source: "manual",
							item_type: "labor",
						},
						{
							name: "Line Set & Equipment Pad Kit",
							quantity: 1,
							unit_price: 265.0,
							total: 265.0,
							source: "manual",
							item_type: "material",
						},
					],
				},
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

	// ============================================================================
	// Vehicles
	// Names are tech-independent identifiers (techs switch vehicles freely);
	// assignment is a reassignable many-to-one pointer (technician.current_vehicle_id).
	// ============================================================================

	const van12 = await db.vehicle.create({
		data: {
			organization_id: org.id,
			name: "Van 12",
			type: "Van",
			license_plate: "WIS-4421",
			year: 2021,
			make: "Ford",
			model: "Transit 250",
			status: "active",
			color: "Pearl White",
			notes: "Primary service van. Roof rack with ladder. Currently crewed by John Smith; Kevin Park rode along this week after his usual van went in for service.",
		},
	});

	const van8 = await db.vehicle.create({
		data: {
			organization_id: org.id,
			name: "Van 8",
			type: "Van",
			license_plate: "WIS-8834",
			year: 2019,
			make: "Chevrolet",
			model: "Express 2500",
			status: "active",
			color: "Fleet Blue",
			notes: "Currently crewed by Maria Rodriguez. Check tire pressure weekly.",
		},
	});

	const truck4 = await db.vehicle.create({
		data: {
			organization_id: org.id,
			name: "Truck 4",
			type: "Truck",
			license_plate: "WIS-1109",
			year: 2020,
			make: "Ram",
			model: "ProMaster 2500",
			status: "active",
			color: "Silver",
			notes: "Spare vehicle — unassigned. Fully stocked for overflow and swaps.",
		},
	});

	// Assign current vehicles (techs switch freely; Truck 4 left as an unassigned spare).
	// John Smith and Kevin Park are both on Van 12 right now — vehicles are not 1:1 with techs.
	await Promise.all([
		db.technician.update({ where: { id: tech1.id }, data: { current_vehicle_id: van12.id } }),
		db.technician.update({ where: { id: tech2.id }, data: { current_vehicle_id: van8.id } }),
		db.technician.update({ where: { id: tech3.id }, data: { current_vehicle_id: van12.id } }),
	]);

	// ------------------------------------------------------------------------
	// Pre-create vehicle stock rows (qty_on_hand 0; on-hand is filled by the
	// ledger below). qty_min / qty_standard are set here so recordMovements'
	// upsert path doesn't reset them to 0.
	// ------------------------------------------------------------------------
	const stockManifest: {
		v: { id: string };
		i: { id: string };
		qty_min: number;
		qty_standard: number;
	}[] = [
		// Van 12 (John Smith + Kevin Park)
		{ v: van12, i: invFilter,      qty_min: 4,  qty_standard: 8 },
		{ v: van12, i: invCapacitor,   qty_min: 3,  qty_standard: 6 },
		{ v: van12, i: invContactor,   qty_min: 2,  qty_standard: 3 },
		{ v: van12, i: invThermostat,  qty_min: 2,  qty_standard: 3 },
		{ v: van12, i: invIgniter,     qty_min: 2,  qty_standard: 3 },
		{ v: van12, i: invFlameSensor, qty_min: 3,  qty_standard: 4 },
		{ v: van12, i: invBlower,      qty_min: 1,  qty_standard: 1 },
		// Van 8 (Maria Rodriguez)
		{ v: van8,  i: invRefrigerant, qty_min: 2,  qty_standard: 2 },
		{ v: van8,  i: invFilter,      qty_min: 4,  qty_standard: 10 },
		{ v: van8,  i: invCapacitor,   qty_min: 3,  qty_standard: 4 },
		{ v: van8,  i: invCondPump,    qty_min: 1,  qty_standard: 2 },
		// Truck 4 (spare — fully loaded)
		{ v: truck4, i: invRefrigerant, qty_min: 2,  qty_standard: 4 },
		{ v: truck4, i: invFilter,      qty_min: 8,  qty_standard: 24 },
		{ v: truck4, i: invCapacitor,   qty_min: 4,  qty_standard: 10 },
		{ v: truck4, i: invThermostat,  qty_min: 2,  qty_standard: 4 },
		{ v: truck4, i: invContactor,   qty_min: 2,  qty_standard: 5 },
		{ v: truck4, i: invBlower,      qty_min: 1,  qty_standard: 1 },
		{ v: truck4, i: invIgniter,     qty_min: 2,  qty_standard: 3 },
		{ v: truck4, i: invFlameSensor, qty_min: 2,  qty_standard: 4 },
		{ v: truck4, i: invCondPump,    qty_min: 1,  qty_standard: 2 },
		{ v: truck4, i: invLineSet,     qty_min: 20, qty_standard: 50 },
		{ v: truck4, i: invCompressor,  qty_min: 1,  qty_standard: 2 },
	];

	const stockMap = new Map<string, { id: string }>();
	for (const m of stockManifest) {
		const row = await db.vehicle_stock_item.create({
			data: {
				vehicle_id: m.v.id,
				inventory_item_id: m.i.id,
				qty_on_hand: 0,
				qty_min: m.qty_min,
				qty_standard: m.qty_standard,
			},
		});
		stockMap.set(`${m.v.id}::${m.i.id}`, row);
	}
	const vs = (v: { id: string }, i: { id: string }) =>
		stockMap.get(`${v.id}::${i.id}`)!;

	// ============================================================================
	// Stock Ledger — every quantity change flows through recordMovements so the
	// stock_movement ledger and cached on-hand columns always reconcile.
	// ============================================================================

	const sysActor = { actor_type: "system" as const };
	const dispActor = { actor_type: "dispatcher" as const, actor_id: dispatcher.id };
	const techActor = (id: string) => ({ actor_type: "technician" as const, actor_id: id });

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const move = (actor: any, movements: any[], opts: any = {}) =>
		db.$transaction((tx) => recordMovements(tx, org.id, actor, movements, opts));

	// ============================================================================
	// Serial & Batch Tracking Demo Data — Blower Motor (is_serialized) +
	// Refrigerant (is_batch_tracked). Everything still flows through
	// recordMovements; serial_unit/stock_batch rows are a byproduct of the
	// ledger, never written directly (except recalled_at — the one field the
	// real PATCH endpoint owns, set here after the fact to model discovery).
	// ============================================================================

	// -- Blower Motor: 5 serialized units covering every serial_unit_status --
	await move(sysActor, [
		{
			inventory_item_id: invBlower.id,
			qty: 5,
			from_location_type: "external",
			to_location_type: "warehouse",
			reason: "initial",
			note: "Opening warehouse count (serialized).",
			serial: {
				create: ["BLW24-0001", "BLW24-0002", "BLW24-0003", "BLW24-0004", "BLW24-0005"].map(
					(serial_number) => ({ serial_number }),
				),
			},
		},
	]);
	const [bu1, bu2, bu3, bu4] = await db.serial_unit.findMany({
		where: { inventory_item_id: invBlower.id },
		orderBy: { serial_number: "asc" },
	});

	// Restock — 2 units to Truck 4 (one becomes the steady-state spare, one is
	// written off below), 1 unit to Van 12.
	await move(dispActor, [
		{ inventory_item_id: invBlower.id, qty: 2, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: truck4.id, reason: "restock", serial: { unit_ids: [bu1.id, bu3.id] } },
		{ inventory_item_id: invBlower.id, qty: 1, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: van12.id, reason: "restock", serial: { unit_ids: [bu2.id] } },
	]);

	// Consumed — installed during the completed Williams PM visit (sets the
	// client-linked consumption snapshot recall lookups read from).
	await move(techActor(tech1.id), [
		{ inventory_item_id: invBlower.id, qty: 1, from_location_type: "vehicle", from_vehicle_id: van12.id, to_location_type: "consumed", reason: "parts_used", visit_id: recurringVisit1.id, serial: { unit_ids: [bu2.id] }, note: "Blower motor replaced — noisy bearing found during PM." },
	]);

	// Lost — cracked housing found on Truck 4, written off via an adjustment.
	const blowerLossAdjustment = await db.vehicle_stock_adjustment.create({
		data: {
			organization_id: org.id,
			vehicle_id: truck4.id,
			type: "field_loss",
			note: "Blower motor housing cracked in transit — discarded.",
			created_by_id: dispatcher.id,
		},
	});
	await move(dispActor, [
		{ inventory_item_id: invBlower.id, qty: 1, from_location_type: "vehicle", from_vehicle_id: truck4.id, to_location_type: "adjustment", reason: "loss", adjustment_id: blowerLossAdjustment.id, serial: { unit_ids: [bu3.id] }, note: "Cracked housing." },
	]);
	await db.vehicle_stock_adjustment_line.create({
		data: {
			adjustment_id: blowerLossAdjustment.id,
			stock_item_id: vs(truck4, invBlower).id,
			qty_before: 2,
			qty_after: 1,
			inventory_impact: -1,
		},
	});

	// Returned — defective unit sent back to the supplier under warranty
	// (never left the warehouse). The 5th unit (BLW24-0005) is left untouched
	// — a clean "just received, in_warehouse" example.
	await move(dispActor, [
		{ inventory_item_id: invBlower.id, qty: 1, from_location_type: "warehouse", to_location_type: "external", reason: "transfer", serial: { unit_ids: [bu4.id] }, note: "Defective unit returned to Ferguson under warranty — RMA #48213." },
	]);

	// -- Refrigerant R-410A: 3 lots (fresh, near-expiry, recalled) --
	const makeLot = (args: {
		inventory_item_id: string;
		batch_number: string;
		supplier?: string;
		expires_at?: Date;
		note?: string;
	}) => db.$transaction((tx) => getOrCreateBatch(tx, org.id, args));

	const lotFresh = await makeLot({
		inventory_item_id: invRefrigerant.id,
		batch_number: "LOT-24-0512",
		supplier: "Airgas",
		expires_at: daysFromNow(410),
	});
	const lotNearExpiry = await makeLot({
		inventory_item_id: invRefrigerant.id,
		batch_number: "LOT-24-0138",
		supplier: "Airgas",
		expires_at: daysFromNow(18),
		note: "Received short-dated — prioritize for FIFO consumption.",
	});
	const lotRecalled = await makeLot({
		inventory_item_id: invRefrigerant.id,
		batch_number: "LOT-23-0899",
		supplier: "RefrigCo Supply",
		expires_at: daysFromNow(300),
		note: "Manufacturer recall — valve seal defect reported across this production run.",
	});

	await move(sysActor, [
		{ inventory_item_id: invRefrigerant.id, qty: 5, from_location_type: "external", to_location_type: "warehouse", reason: "initial", note: "Opening warehouse count — Lot LOT-24-0512.", batch_allocations: [{ batch_id: lotFresh.id, qty: 5 }] },
		{ inventory_item_id: invRefrigerant.id, qty: 3, from_location_type: "external", to_location_type: "warehouse", reason: "initial", note: "Opening warehouse count — Lot LOT-24-0138.", batch_allocations: [{ batch_id: lotNearExpiry.id, qty: 3 }] },
		{ inventory_item_id: invRefrigerant.id, qty: 4, from_location_type: "external", to_location_type: "warehouse", reason: "initial", note: "Opening warehouse count — Lot LOT-23-0899.", batch_allocations: [{ batch_id: lotRecalled.id, qty: 4 }] },
	]);

	await move(dispActor, [
		{ inventory_item_id: invRefrigerant.id, qty: 1, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: van8.id, reason: "restock", batch_allocations: [{ batch_id: lotFresh.id, qty: 1 }] },
		{ inventory_item_id: invRefrigerant.id, qty: 3, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: truck4.id, reason: "restock", batch_allocations: [{ batch_id: lotFresh.id, qty: 3 }] },
		{ inventory_item_id: invRefrigerant.id, qty: 2, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: van8.id, reason: "restock", batch_allocations: [{ batch_id: lotRecalled.id, qty: 2 }] },
	]);

	// Consumed on job2 before the recall was discovered — traced by the recall report.
	const visit2RefrigerantLine = await db.job_visit_line_item.findFirst({
		where: { visit_id: visit2.id, inventory_item_id: invRefrigerant.id },
		select: { id: true },
	});
	await move(techActor(tech2.id), [
		{ inventory_item_id: invRefrigerant.id, qty: 2, from_location_type: "vehicle", from_vehicle_id: van8.id, to_location_type: "consumed", reason: "parts_used", visit_id: visit2.id, visit_line_item_id: visit2RefrigerantLine?.id ?? undefined, batch_allocations: [{ batch_id: lotRecalled.id, qty: 2 }], note: "R-410A charge during rooftop install." },
	]);

	// Recall discovered after the fact — blocks the 2 remaining warehouse units
	// from any further pick (fresh/near-expiry lots are unaffected).
	await db.stock_batch.update({
		where: { id: lotRecalled.id },
		data: { recalled_at: daysFromNow(-3) },
	});

	// -- Compressor: dual-tracked (is_serialized + is_batch_tracked) — one lot,
	// 3 serialized units, each unit's batch_id points back to the lot. --
	const lotCompressor = await makeLot({
		inventory_item_id: invCompressor.id,
		batch_number: "LOT-COMP-24-03",
		supplier: "Copeland Distribution",
	});
	await move(sysActor, [
		{
			inventory_item_id: invCompressor.id,
			qty: 3,
			from_location_type: "external",
			to_location_type: "warehouse",
			reason: "initial",
			note: "Opening warehouse count (dual-tracked).",
			serial: {
				create: ["CMP24-0001", "CMP24-0002", "CMP24-0003"].map((serial_number) => ({
					serial_number,
					batch_id: lotCompressor.id,
				})),
			},
		},
	]);
	const [cu1] = await db.serial_unit.findMany({
		where: { inventory_item_id: invCompressor.id },
		orderBy: { serial_number: "asc" },
	});
	await move(dispActor, [
		{ inventory_item_id: invCompressor.id, qty: 1, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: truck4.id, reason: "restock", serial: { unit_ids: [cu1.id] } },
	]);

	// (a) Initial receive — external → warehouse. Sized to cover all downstream
	//     outflow while leaving contactor at/below threshold.
	await move(sysActor, [
		{ inventory_item_id: invFilter.id,      qty: 78,  from_location_type: "external", to_location_type: "warehouse", reason: "initial", note: "Opening warehouse count." },
		{ inventory_item_id: invCapacitor.id,   qty: 32,  from_location_type: "external", to_location_type: "warehouse", reason: "initial", note: "Opening warehouse count." },
		{ inventory_item_id: invThermostat.id,  qty: 15,  from_location_type: "external", to_location_type: "warehouse", reason: "initial", note: "Opening warehouse count." },
		{ inventory_item_id: invContactor.id,   qty: 9,   from_location_type: "external", to_location_type: "warehouse", reason: "initial", note: "Opening warehouse count." },
		{ inventory_item_id: invIgniter.id,     qty: 12,  from_location_type: "external", to_location_type: "warehouse", reason: "initial", note: "Opening warehouse count." },
		{ inventory_item_id: invFlameSensor.id, qty: 18,  from_location_type: "external", to_location_type: "warehouse", reason: "initial", note: "Opening warehouse count." },
		{ inventory_item_id: invCondPump.id,    qty: 6,   from_location_type: "external", to_location_type: "warehouse", reason: "initial", note: "Opening warehouse count." },
		{ inventory_item_id: invLineSet.id,     qty: 150, from_location_type: "external", to_location_type: "warehouse", reason: "initial", note: "Opening warehouse count." },
	]);

	// (b) Base restock — warehouse → each vehicle.
	await move(dispActor, [
		// Van 12
		{ inventory_item_id: invFilter.id,      qty: 8, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: van12.id, reason: "restock" },
		{ inventory_item_id: invCapacitor.id,   qty: 6, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: van12.id, reason: "restock" },
		{ inventory_item_id: invContactor.id,   qty: 1, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: van12.id, reason: "restock" },
		{ inventory_item_id: invThermostat.id,  qty: 3, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: van12.id, reason: "restock" },
		{ inventory_item_id: invIgniter.id,     qty: 2, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: van12.id, reason: "restock" },
		{ inventory_item_id: invFlameSensor.id, qty: 4, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: van12.id, reason: "restock" },
		// Van 8
		{ inventory_item_id: invFilter.id,      qty: 10, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: van8.id, reason: "restock" },
		{ inventory_item_id: invCapacitor.id,   qty: 2,  from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: van8.id, reason: "restock" },
		{ inventory_item_id: invCondPump.id,    qty: 1,  from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: van8.id, reason: "restock" },
		// Truck 4 (spare — fully loaded)
		{ inventory_item_id: invFilter.id,      qty: 24, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: truck4.id, reason: "restock" },
		{ inventory_item_id: invCapacitor.id,   qty: 10, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: truck4.id, reason: "restock" },
		{ inventory_item_id: invThermostat.id,  qty: 4,  from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: truck4.id, reason: "restock" },
		{ inventory_item_id: invContactor.id,   qty: 5,  from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: truck4.id, reason: "restock" },
		{ inventory_item_id: invIgniter.id,     qty: 3,  from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: truck4.id, reason: "restock" },
		{ inventory_item_id: invFlameSensor.id, qty: 4,  from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: truck4.id, reason: "restock" },
		{ inventory_item_id: invCondPump.id,    qty: 2,  from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: truck4.id, reason: "restock" },
		{ inventory_item_id: invLineSet.id,     qty: 50, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: truck4.id, reason: "restock" },
	]);

	// (c) Historical parts_used — vehicle → consumed, tied to completed visits.
	const v1CapLine = await db.job_visit_line_item.findFirst({
		where: { visit_id: visit1.id, inventory_item_id: invCapacitor.id },
		select: { id: true },
	});
	const rv1FilterLine = await db.job_visit_line_item.findFirst({
		where: { visit_id: recurringVisit1.id, inventory_item_id: invFilter.id },
		select: { id: true },
	});

	// visit1: Maria (Van 8) installed 1 capacitor
	await move(techActor(tech2.id), [
		{ inventory_item_id: invCapacitor.id, qty: 1, from_location_type: "vehicle", from_vehicle_id: van8.id, to_location_type: "consumed", reason: "parts_used", visit_id: visit1.id, visit_line_item_id: v1CapLine?.id ?? undefined, note: "Dual run capacitor installed on AC repair." },
	]);
	await db.vehicle_stock_usage.create({
		data: {
			stock_item_id: vs(van8, invCapacitor).id,
			visit_id: visit1.id,
			technician_id: tech2.id,
			qty_used: 1,
			visit_line_item_id: v1CapLine?.id ?? null,
		},
	});

	// recurringVisit1: John (Van 12) used 4 filters on the Williams PM
	await move(techActor(tech1.id), [
		{ inventory_item_id: invFilter.id, qty: 4, from_location_type: "vehicle", from_vehicle_id: van12.id, to_location_type: "consumed", reason: "parts_used", visit_id: recurringVisit1.id, visit_line_item_id: rv1FilterLine?.id ?? undefined, note: "Filter replacement across 4 units." },
	]);
	await db.vehicle_stock_usage.create({
		data: {
			stock_item_id: vs(van12, invFilter).id,
			visit_id: recurringVisit1.id,
			technician_id: tech1.id,
			qty_used: 4,
			visit_line_item_id: rv1FilterLine?.id ?? null,
		},
	});

	// (d) Direct consumption — warehouse → consumed (dispatch-allocated part).
	await move(dispActor, [
		{ inventory_item_id: invIgniter.id, qty: 1, from_location_type: "warehouse", to_location_type: "consumed", reason: "direct_consumption", note: "Igniter pulled from warehouse for counter sale / shop use." },
	]);

	// (e) Transfer — Truck 4 → Van 8 (top up Maria's capacitors from the spare).
	await move(dispActor, [
		{ inventory_item_id: invCapacitor.id, qty: 2, from_location_type: "vehicle", from_vehicle_id: truck4.id, to_location_type: "vehicle", to_vehicle_id: van8.id, reason: "transfer", note: "Capacitors moved from spare truck to Van 8." },
	]);

	// (f) Loss — damaged refrigerant cylinder on Van 8, recorded against a field_loss adjustment.
	const lossAdjustment = await db.vehicle_stock_adjustment.create({
		data: {
			organization_id: org.id,
			vehicle_id: van8.id,
			type: "field_loss",
			note: "Refrigerant cylinder valve damaged in transit — discarded.",
			created_by_tech_id: tech2.id,
		},
	});
	await move(techActor(tech2.id), [
		{ inventory_item_id: invRefrigerant.id, qty: 1, from_location_type: "vehicle", from_vehicle_id: van8.id, to_location_type: "adjustment", reason: "loss", adjustment_id: lossAdjustment.id, batch_allocations: [{ batch_id: lotFresh.id, qty: 1 }], note: "Damaged R-410A cylinder." },
	]);
	await db.vehicle_stock_adjustment_line.create({
		data: {
			adjustment_id: lossAdjustment.id,
			stock_item_id: vs(van8, invRefrigerant).id,
			qty_before: 1,
			qty_after: 0,
			inventory_impact: -1,
		},
	});

	// (g) Supplier purchase — Maria/John bought flame sensors at a local supply house (external → Van 12).
	await move(techActor(tech1.id), [
		{ inventory_item_id: invFlameSensor.id, qty: 2, from_location_type: "external", to_location_type: "vehicle", to_vehicle_id: van12.id, reason: "supplier_purchase", note: "Field purchase — 2 flame sensors from Ferguson." },
	]);

	// ============================================================================
	// Restock Requests — all four lifecycle states (each on a distinct stock item)
	// ============================================================================

	// pending — John flags low igniters on Van 12
	await db.vehicle_restock_request.create({
		data: {
			organization_id: org.id,
			stock_item_id: vs(van12, invIgniter).id,
			technician_id: tech1.id,
			qty_requested: 2,
			note: "Down to a couple igniters — please top up.",
			status: "pending",
		},
	});

	// dismissed — Maria's condensate pump request, declined by dispatch
	await db.vehicle_restock_request.create({
		data: {
			organization_id: org.id,
			stock_item_id: vs(van8, invCondPump).id,
			technician_id: tech2.id,
			qty_requested: 1,
			note: "Would like a spare condensate pump.",
			status: "dismissed",
			dismissed_reason: "dispatch",
		},
	});

	// acknowledged — Maria's capacitor request, dispatch has seen it
	await db.vehicle_restock_request.create({
		data: {
			organization_id: org.id,
			stock_item_id: vs(van8, invCapacitor).id,
			technician_id: tech2.id,
			qty_requested: 2,
			note: "Restock capacitors after the AC repair.",
			status: "acknowledged",
			acknowledged_at: daysFromNow(-1),
			acknowledged_by_id: dispatcher.id,
		},
	});

	// resolved — John's thermostat request, auto-resolved by a warehouse restock
	await db.vehicle_restock_request.create({
		data: {
			organization_id: org.id,
			stock_item_id: vs(van12, invThermostat).id,
			technician_id: tech1.id,
			qty_requested: 2,
			note: "Need two thermostats for upcoming installs.",
			status: "resolved",
			resolved_at: daysFromNow(-1),
			resolved_note: "Auto-resolved by stock movement (dispatcher)",
		},
	});
	await move(dispActor, [
		{ inventory_item_id: invThermostat.id, qty: 2, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: van12.id, reason: "restock", note: "Restocked thermostats for tomorrow's installs." },
	]);

	// ============================================================================
	// End-of-Day records + readiness
	// ============================================================================

	// EOD #1 — Van 12, John, yesterday. Contactor restock fell short (warehouse low).
	const restock1 = await db.vehicle_restock_record.create({
		data: {
			organization_id: org.id,
			vehicle_id: van12.id,
			completed_at: yesterday,
			day: yesterday,
			completed_by_tech_id: tech1.id,
			notes: "Restocked filters from warehouse. Contactors short — flagged for reorder.",
		},
	});
	await move(techActor(tech1.id), [
		{ inventory_item_id: invFilter.id,    qty: 4, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: van12.id, reason: "restock", restock_record_id: restock1.id, note: "EOD restock." },
		{ inventory_item_id: invContactor.id, qty: 1, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: van12.id, reason: "restock", restock_record_id: restock1.id, note: "EOD restock (partial — warehouse low)." },
	]);
	await db.vehicle_restock_line.createMany({
		data: [
			{ restock_record_id: restock1.id, stock_item_id: vs(van12, invFilter).id,    qty_restocked: 4, qty_shortfall: 0 },
			{ restock_record_id: restock1.id, stock_item_id: vs(van12, invContactor).id, qty_restocked: 1, qty_shortfall: 2 },
		],
	});

	// EOD #2 — Van 8, Maria, today. Zero shortfall → auto-confirms readiness for tomorrow.
	const restock2 = await db.vehicle_restock_record.create({
		data: {
			organization_id: org.id,
			vehicle_id: van8.id,
			completed_at: today,
			day: today,
			completed_by_tech_id: tech2.id,
			notes: "Full restock from warehouse. Ready for tomorrow.",
		},
	});
	await move(techActor(tech2.id), [
		{ inventory_item_id: invRefrigerant.id, qty: 1, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: van8.id, reason: "restock", restock_record_id: restock2.id, note: "EOD restock." },
		{ inventory_item_id: invFilter.id,      qty: 2, from_location_type: "warehouse", to_location_type: "vehicle", to_vehicle_id: van8.id, reason: "restock", restock_record_id: restock2.id, note: "EOD restock." },
	]);
	await db.vehicle_restock_line.createMany({
		data: [
			{ restock_record_id: restock2.id, stock_item_id: vs(van8, invRefrigerant).id, qty_restocked: 1, qty_shortfall: 0 },
			{ restock_record_id: restock2.id, stock_item_id: vs(van8, invFilter).id,      qty_restocked: 2, qty_shortfall: 0 },
		],
	});
	await db.vehicle_readiness.create({
		data: {
			vehicle_id: van8.id,
			organization_id: org.id,
			date: today,
			confirmed_by_tech_id: tech2.id,
			restock_record_id: restock2.id,
			notes: "Auto-confirmed at EOD — zero shortfalls.",
		},
	});

	// ============================================================================
	// Stock Adjustment — audit correction (cycle count found Van 12 short 1 igniter)
	// ============================================================================
	const auditAdjustment = await db.vehicle_stock_adjustment.create({
		data: {
			organization_id: org.id,
			vehicle_id: van12.id,
			type: "audit",
			note: "Cycle count: 1 igniter unaccounted for on Van 12.",
			created_by_id: dispatcher.id,
		},
	});
	await move(dispActor, [
		{ inventory_item_id: invIgniter.id, qty: 1, from_location_type: "vehicle", from_vehicle_id: van12.id, to_location_type: "adjustment", reason: "audit_correction", adjustment_id: auditAdjustment.id, note: "Audit write-down." },
	]);
	await db.vehicle_stock_adjustment_line.create({
		data: {
			adjustment_id: auditAdjustment.id,
			stock_item_id: vs(van12, invIgniter).id,
			qty_before: 2,
			qty_after: 1,
			inventory_impact: -1,
		},
	});

	// ============================================================================
	// Shifts + Time Entries
	// ============================================================================
	const [shift1, shift2] = await Promise.all([
		db.technician_shift.create({
			data: {
				tech_id: tech1.id,
				org_id: org.id,
				started_at: dateAt(yesterday, 7),
				ended_at: dateAt(yesterday, 16, 30),
				gross_hours: 9.5,
				break_hours: 0.5,
				payable_hours: 9.0,
			},
		}),
		db.technician_shift.create({
			data: {
				tech_id: tech2.id,
				org_id: org.id,
				started_at: dateAt(yesterday, 8),
				ended_at: dateAt(yesterday, 16),
				gross_hours: 8.0,
				break_hours: 0.5,
				payable_hours: 7.5,
			},
		}),
	]);
	await db.technician_shift_break.createMany({
		data: [
			{ shift_id: shift1.id, tech_id: tech1.id, reason: "Lunch", is_paid: false, pre_break_status: "Working", started_at: dateAt(yesterday, 12), ended_at: dateAt(yesterday, 12, 30), duration_hrs: 0.5 },
			{ shift_id: shift2.id, tech_id: tech2.id, reason: "Lunch", is_paid: false, pre_break_status: "Working", started_at: dateAt(yesterday, 12, 30), ended_at: dateAt(yesterday, 13), duration_hrs: 0.5 },
		],
	});
	await db.visit_tech_time_entry.createMany({
		data: [
			{ visit_id: visit1.id, tech_id: tech2.id, clocked_in_at: dateAt(yesterday, 9, 15), clocked_out_at: dateAt(yesterday, 11, 30), hours_worked: 2.25 },
			{ visit_id: recurringVisit1.id, tech_id: tech1.id, clocked_in_at: dateAt(occurrencePastStart, 8, 5), clocked_out_at: dateAt(occurrencePastStart, 11, 50), hours_worked: 3.75 },
		],
	});
	await db.technician_shift.createMany({
		data: [
			{ tech_id: tech1.id, org_id: org.id, started_at: dateAt(today, 7), ended_at: null},
			{ tech_id: tech2.id, org_id: org.id, started_at: dateAt(today, 8), ended_at: null},
		],
	})

	// ============================================================================
	// Technician Notifications (John Smith)
	// ============================================================================
	await db.technician_notification.createMany({
		data: [
			{ technician_id: tech1.id, type: "visit_assigned", title: "New visit assigned", body: "You've been assigned to Filter Replacement — Anderson Bldg A today at 8:00 AM.", action_url: `/tech/jobs/${job3.id}`, created_at: minsAgo(45) },
			{ technician_id: tech1.id, type: "visit_changed", title: "Visit time updated", body: "Follow-Up AC Check — Johnson Residence moved to the 11:00–12:00 window.", action_url: `/tech/jobs/${job1.id}`, read_at: minsAgo(20), created_at: hrsAgo(3) },
			{ technician_id: tech1.id, type: "dispatch_message", title: "Message from dispatch", body: "Heads up — Kevin is riding with you on Van 12 this week. Coordinate the morning route.", created_at: hrsAgo(20) },
		],
	});

	// ============================================================================
	// Inventory Tags
	// ============================================================================
	await Promise.all([
		db.inventory_tag.create({
			data: {
				organization_id: org.id,
				label: "Fast-moving",
				items: { connect: [{ id: invFilter.id }, { id: invCapacitor.id }] },
			},
		}),
		db.inventory_tag.create({
			data: {
				organization_id: org.id,
				label: "Electrical",
				items: { connect: [{ id: invCapacitor.id }, { id: invContactor.id }] },
			},
		}),
		db.inventory_tag.create({
			data: {
				organization_id: org.id,
				label: "Refrigerant",
				items: { connect: [{ id: invRefrigerant.id }, { id: invLineSet.id }] },
			},
		}),
		db.inventory_tag.create({
			data: {
				organization_id: org.id,
				label: "Controls",
				items: { connect: [{ id: invThermostat.id }, { id: invIgniter.id }, { id: invFlameSensor.id }] },
			},
		}),
	]);

	// ============================================================================
	// Tax post-pass — wire tax_group_id + taxable onto line items and recompute
	// tax_amount / totals / tax_snapshot via the centralized tax engine. Exempt
	// clients (Anderson) get taxable=false and a client_exempt snapshot.
	// ============================================================================
	const exemptClientIds = new Set<string>([client4.id]);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const taxOf = (lis: { id: string; total: any }[], exempt: boolean, dType: any, dValue: any, lockedAt?: Date) => {
		const inputs: LineItemTaxInput[] = lis.map((li) => ({
			id: li.id,
			total_cents: Math.round(Number(li.total) * 100),
			taxable: !exempt,
			tax_group: exempt ? null : taxGroupConfig,
		}));
		return calculateDocumentTax(
			{ line_items: inputs, discount_type: dType ?? null, discount_value: dValue != null ? Number(dValue) : null },
			exempt,
			lockedAt,
		);
	};

	// Quotes
	for (const q of await db.quote.findMany({
		select: { id: true, client_id: true, discount_type: true, discount_value: true, approved_at: true, sent_at: true },
	})) {
		const lis = await db.quote_line_item.findMany({ where: { quote_id: q.id }, select: { id: true, total: true } });
		if (lis.length === 0) continue;
		const exempt = exemptClientIds.has(q.client_id);
		const out = taxOf(lis, exempt, q.discount_type, q.discount_value, q.approved_at ?? q.sent_at ?? undefined);
		for (const li of lis) {
			await db.quote_line_item.update({
				where: { id: li.id },
				data: { taxable: !exempt, tax_group_id: exempt ? null : taxGroup.id, tax_amount: centsToDollars(out.line_item_tax_amounts[li.id] ?? 0) },
			});
		}
		await db.quote.update({
			where: { id: q.id },
			data: {
				subtotal: centsToDollars(out.subtotal_cents),
				discount_amount: centsToDollars(out.discount_cents),
				tax_rate: out.effective_rate,
				tax_amount: centsToDollars(out.total_tax_cents),
				total: centsToDollars(out.total_cents),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				tax_snapshot: out.snapshot as any,
			},
		});
	}

	// Jobs (skip recurring containers / cancelled jobs with no line items)
	for (const j of await db.job.findMany({
		select: { id: true, client_id: true, discount_type: true, discount_value: true, actual_total: true, completed_at: true },
	})) {
		const lis = await db.job_line_item.findMany({ where: { job_id: j.id }, select: { id: true, total: true } });
		if (lis.length === 0) continue;
		const exempt = exemptClientIds.has(j.client_id);
		const out = taxOf(lis, exempt, j.discount_type, j.discount_value, j.completed_at ?? undefined);
		for (const li of lis) {
			await db.job_line_item.update({
				where: { id: li.id },
				data: { taxable: !exempt, tax_group_id: exempt ? null : taxGroup.id, tax_amount: centsToDollars(out.line_item_tax_amounts[li.id] ?? 0) },
			});
		}
		await db.job.update({
			where: { id: j.id },
			data: {
				subtotal: centsToDollars(out.subtotal_cents),
				discount_amount: centsToDollars(out.discount_cents),
				tax_rate: out.effective_rate,
				tax_amount: centsToDollars(out.total_tax_cents),
				...(j.actual_total != null
					? { actual_total: centsToDollars(out.total_cents) }
					: { estimated_total: centsToDollars(out.total_cents) }),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				tax_snapshot: out.snapshot as any,
			},
		});
	}

	// Job visits (client exemption resolved via the parent job)
	for (const v of await db.job_visit.findMany({
		select: { id: true, discount_type: true, discount_value: true, actual_end_at: true, job: { select: { client_id: true } } },
	})) {
		const lis = await db.job_visit_line_item.findMany({ where: { visit_id: v.id }, select: { id: true, total: true } });
		if (lis.length === 0) continue;
		const exempt = exemptClientIds.has(v.job.client_id);
		const out = taxOf(lis, exempt, v.discount_type, v.discount_value, v.actual_end_at ?? undefined);
		for (const li of lis) {
			await db.job_visit_line_item.update({
				where: { id: li.id },
				data: { taxable: !exempt, tax_group_id: exempt ? null : taxGroup.id, tax_amount: centsToDollars(out.line_item_tax_amounts[li.id] ?? 0) },
			});
		}
		await db.job_visit.update({
			where: { id: v.id },
			data: {
				subtotal: centsToDollars(out.subtotal_cents),
				discount_amount: centsToDollars(out.discount_cents),
				tax_rate: out.effective_rate,
				tax_amount: centsToDollars(out.total_tax_cents),
				total: centsToDollars(out.total_cents),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				tax_snapshot: out.snapshot as any,
			},
		});
	}

	// Invoices (recompute totals; clamp amount_paid so paid/partial states stay valid)
	for (const inv of await db.invoice.findMany({
		select: { id: true, client_id: true, discount_type: true, discount_value: true, amount_paid: true, issued_at: true, sent_at: true },
	})) {
		const lis = await db.invoice_line_item.findMany({ where: { invoice_id: inv.id }, select: { id: true, total: true } });
		if (lis.length === 0) continue;
		const exempt = exemptClientIds.has(inv.client_id);
		const out = taxOf(lis, exempt, inv.discount_type, inv.discount_value, inv.sent_at ?? inv.issued_at ?? undefined);
		for (const li of lis) {
			await db.invoice_line_item.update({
				where: { id: li.id },
				data: { taxable: !exempt, tax_group_id: exempt ? null : taxGroup.id, tax_amount: centsToDollars(out.line_item_tax_amounts[li.id] ?? 0) },
			});
		}
		const total = centsToDollars(out.total_cents);
		const amountPaid = Math.min(Number(inv.amount_paid), total);
		await db.invoice.update({
			where: { id: inv.id },
			data: {
				subtotal: centsToDollars(out.subtotal_cents),
				discount_amount: centsToDollars(out.discount_cents),
				tax_rate: out.effective_rate,
				tax_amount: centsToDollars(out.total_tax_cents),
				total,
				amount_paid: amountPaid,
				balance_due: centsToDollars(Math.round((total - amountPaid) * 100)),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				tax_snapshot: out.snapshot as any,
			},
		});
	}

	// ============================================================================
	// Activity Logs — stock / vehicle / inventory feed entries
	// ============================================================================
	await db.log.createMany({
		data: [
			{ organization_id: org.id, event_type: "inventory.created", action: "created", entity_type: "inventory_item", entity_id: invBlower.id, actor_type: "dispatcher", actor_id: dispatcher.id, actor_name: dispatcher.name, changes: { name: { old: null, new: "Blower Motor 1/2 HP 115V" } }, timestamp: hrsAgo(30) },
			{ organization_id: org.id, event_type: "vehicle.eod_completed", action: "updated", entity_type: "vehicle", entity_id: van12.id, actor_type: "technician", actor_id: tech1.id, actor_name: tech1.name, changes: { eod: { old: null, new: "completed" } }, timestamp: hrsAgo(16) },
			{ organization_id: org.id, event_type: "stock.restock_fulfilled", action: "updated", entity_type: "vehicle", entity_id: van8.id, actor_type: "dispatcher", actor_id: dispatcher.id, actor_name: dispatcher.name, changes: { capacitors: { old: 1, new: 3 } }, timestamp: hrsAgo(22) },
			{ organization_id: org.id, event_type: "vehicle.readiness_confirmed", action: "updated", entity_type: "vehicle", entity_id: van8.id, actor_type: "technician", actor_id: tech2.id, actor_name: tech2.name, changes: { ready: { old: false, new: true } }, timestamp: hrsAgo(15) },
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
		`  Projects:          6  Active×2, Planning, Completed, OnHold, Cancelled (P-0006 unassigned manager)`,
	);
	console.log(
		`  Jobs:             13  6 standalone + 7 attached to projects (P-0006 has none)`,
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
	console.log(`  Tax:               2 rates → 1 group "WI Standard" (org default)`);
	console.log(`  Inventory:         10 items w/ alt_ids (refrigerant + contactor below threshold)`);
	console.log(`  Vehicles:          3  (Van 12 → Smith+Park, Van 8 → Rodriguez, Truck 4 spare)`);
	console.log(`  Stock Ledger:      receive/restock/parts_used/transfer/loss/supplier_purchase/EOD`);
	console.log(`  Restock Requests:  4  pending, fulfilled, dismissed, discrepant`);
	console.log(`  EOD Records:       2  (Van 12 w/ shortfall, Van 8 → readiness confirmed)`);
	console.log(`  Adjustments:       2  field_loss + audit`);
	console.log(`  Shifts:            2  (+ lunch breaks, visit time entries)`);
	console.log(`  Notifications:     3  (John Smith)`);
	console.log(`  Inventory Tags:    4  Fast-moving, Electrical, Refrigerant, Controls`);
	console.log(`  Serial Units:      5  Blower Motor — in_warehouse/on_vehicle/consumed/lost/returned`);
	console.log(`  Stock Batches:     3  Refrigerant lots — fresh, near-expiry, recalled (2 consumed pre-recall)`);
	console.log(`  Barcodes:          4  items pre-labeled (rest lazily assigned on first scan)`);
	console.log(
		`  Activity Logs:     41 entries covering all feed event types`,
	);
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e);
		await db.$disconnect();
		process.exit(1);
	});
