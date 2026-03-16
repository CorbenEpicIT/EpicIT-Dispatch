import { defineConfig, env } from "prisma/config";
import type { PrismaConfig } from "prisma";
import "dotenv/config";

export default {
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		url: env("DATABASE_URL"),
	},
} satisfies PrismaConfig;
