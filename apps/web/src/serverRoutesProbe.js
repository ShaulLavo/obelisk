import { client } from "~/client";
import { logger } from "~/logger";
const stringifyPayload = (payload) => {
    if (typeof payload === "string")
        return payload;
    try {
        return JSON.stringify(payload);
    }
    catch {
        return "<unserializable payload>";
    }
};
const extractErrorPayload = (error) => {
    if (!error || typeof error !== "object")
        return error;
    if ("value" in error)
        return error.value;
    return error;
};
const logRoute = async (route, request) => {
    try {
        const result = await request;
        const typedResult = result;
        const baseLog = { route, status: typedResult.status ?? "unknown" };
        if (typedResult.error) {
            logger.warn({
                ...baseLog,
                error: stringifyPayload(extractErrorPayload(typedResult.error)),
            }, "server route probe returned error");
            return;
        }
        logger.info({
            ...baseLog,
            payload: stringifyPayload(typedResult.data),
        }, "server route probe succeeded");
    }
    catch (error) {
        logger.error({
            route,
            error: error instanceof Error ? error.message : String(error),
        }, "server route probe failed");
    }
};
export const pingServerRoutes = async () => {
    await Promise.all([
        logRoute("GET /", client.get()),
        logRoute("GET /id/:id", client.id({ id: "probe" }).get()),
        logRoute("POST /mirror", client.mirror.post({
            id: 1,
            name: "mirror-probe",
        })),
    ]);
};
