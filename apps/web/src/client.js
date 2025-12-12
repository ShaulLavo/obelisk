import { treaty } from "@elysiajs/eden";
import { env } from "~/env";
export const client = treaty(env.apiOrigin);
