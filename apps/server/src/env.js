import fs from "node:fs";
import path from "node:path";
import { parse as parseEnvFile } from "dotenv";
import { z } from "zod";
const envMode = process.env.NODE_ENV ?? "development";
const envFiles = [
    { name: ".env", allowOverride: false },
    { name: ".env.local", allowOverride: true },
    { name: `.env.${envMode}`, allowOverride: true },
    { name: `.env.${envMode}.local`, allowOverride: true },
];
const envDirectories = [
    { dir: path.resolve(__dirname, "..", "..", ".."), allowDirOverride: false },
    { dir: path.resolve(__dirname, ".."), allowDirOverride: true },
];
const originalEnvKeys = new Set(Object.keys(process.env));
const applyEnvFile = (filePath, shouldOverride) => {
    if (!fs.existsSync(filePath))
        return;
    const parsed = parseEnvFile(fs.readFileSync(filePath));
    for (const [key, value] of Object.entries(parsed)) {
        const hasKey = Object.prototype.hasOwnProperty.call(process.env, key);
        if (!hasKey) {
            process.env[key] = value;
            continue;
        }
        if (shouldOverride && !originalEnvKeys.has(key)) {
            process.env[key] = value;
        }
    }
};
for (const { dir, allowDirOverride } of envDirectories) {
    for (const { name, allowOverride } of envFiles) {
        const filePath = path.join(dir, name);
        const shouldOverride = allowOverride || allowDirOverride;
        applyEnvFile(filePath, shouldOverride);
    }
}
const envSchema = z.object({
    VITE_SERVER_PORT: z.coerce.number().int().positive(),
    VITE_WEB_PORT: z.coerce.number().int().positive(),
    VITE_WEB_ORIGIN: z.url().optional(),
    WEB_ORIGIN: z.url().optional(),
});
const envData = envSchema.parse(process.env);
const serverPort = envData.VITE_SERVER_PORT;
const webPort = envData.VITE_WEB_PORT;
const webOrigin = envData.VITE_WEB_ORIGIN ?? envData.WEB_ORIGIN;
export const env = {
    serverPort,
    webPort,
    webOrigin: webOrigin ?? `http://localhost:${webPort}`,
};
