const promptUser = "guest";
const promptHost = "vibe";
const ROOT_PATH = "/";
const ANSI_RESET = "\x1b[0m";
const ANSI_DIM = "\x1b[2m";
const userColor = [56, 189, 248]; // sky-400
const hostColor = [244, 114, 182]; // pink-400
const pathColor = [248, 180, 0]; // amber-400
const sourceColor = [94, 234, 212]; // teal-300
const symbolColor = [74, 222, 128]; // green-400
const timestampColor = [148, 163, 184]; // slate-400
const formatTime = (timestamp) => {
    const hours = timestamp.getHours().toString().padStart(2, "0");
    const minutes = timestamp.getMinutes().toString().padStart(2, "0");
    const seconds = timestamp.getSeconds().toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
};
const formatPromptPath = (path) => {
    if (!path)
        return ROOT_PATH;
    return path.startsWith("/") ? path : `${ROOT_PATH}${path}`;
};
const colorCode = ([r, g, b]) => `\x1b[38;2;${r};${g};${b}m`;
const colorize = (rgb, text) => `${colorCode(rgb)}${text}${ANSI_RESET}`;
const dimText = (text) => `${ANSI_DIM}${text}${ANSI_RESET}`;
const dimColorize = (rgb, text) => `${ANSI_DIM}${colorCode(rgb)}${text}${ANSI_RESET}`;
export const createPrompt = (path, sourceLabel) => {
    const now = formatTime(new Date());
    const timestamp = dimColorize(timestampColor, `[${now}]`);
    const identity = `${colorize(userColor, promptUser)}${dimText("@")}${colorize(hostColor, promptHost)}`;
    const location = `${dimText(":")}${colorize(pathColor, formatPromptPath(path))}`;
    const source = sourceLabel
        ? ` ${dimText("(")}${colorize(sourceColor, sourceLabel)}${dimText(")")}`
        : "";
    const symbol = colorize(symbolColor, "$");
    return {
        label: `${timestamp} ${identity}${location}${source} ${symbol} `,
        continuation: dimText("... "),
    };
};
