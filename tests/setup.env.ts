// Next loads .env for us at runtime; Vitest does not, so the DB-backed suites
// need DATABASE_URL in the environment before Prisma is constructed.
import { config } from "dotenv";
config();
