import { HistoryController } from "./historyController";
import { closestLeftBoundary, closestRightBoundary, collectAutocompleteCandidates, countLines, getLastToken, getSharedFragment, hasTailingWhitespace, isIncompleteInput, offsetToColRow, } from "./localEchoUtils";
// ANSI escape codes
const ANSI = {
    CURSOR_UP: "\x1B[A",
    CURSOR_DOWN: "\x1B[B",
    CURSOR_RIGHT: "\x1B[C",
    CURSOR_LEFT: "\x1B[D",
    CURSOR_NEXT_LINE: "\x1B[E",
    CURSOR_PREV_LINE: "\x1B[F",
    ERASE_LINE: "\x1B[K",
    CARRIAGE_RETURN: "\r",
    NEWLINE: "\r\n",
};
// Key codes
const KEY = {
    ESCAPE: 0x1b,
    BACKSPACE: 0x7f,
    ENTER: "\r",
    TAB: "\t",
    CTRL_C: "\x03",
};
// Escape sequences for special keys
const ESCAPE_SEQ = {
    UP: "[A",
    DOWN: "[B",
    LEFT: "[D",
    RIGHT: "[C",
    DELETE: "[3~",
    END: "[F",
    HOME: "[H",
    ALT_LEFT: "b",
    ALT_RIGHT: "f",
    ALT_BACKSPACE: "\x7F",
};
// ANSI strip regex intentionally contains control codes to match escape sequences
// eslint-disable-next-line no-control-regex
const ANSI_COLOR_REGEX = /\u001B\[[0-9;]*m/g;
const stripAnsi = (value) => value.replace(ANSI_COLOR_REGEX, "");
/**
 * Local terminal controller for displaying messages and handling local echo.
 *
 * Supports bash-like input primitives:
 * - Arrow navigation on input
 * - Alt-arrow for word-boundary navigation
 * - Alt-backspace for word-boundary deletion
 * - Multi-line input for incomplete commands
 * - Tab completion with autocomplete handlers
 * - Command history navigation
 */
export class LocalEchoController {
    term = null;
    history;
    maxAutocompleteEntries;
    autocompleteHandlers = [];
    active = false;
    input = "";
    cursor = 0;
    activePrompt = null;
    activeCharPrompt = null;
    termSize = { cols: 0, rows: 0 };
    disposables = [];
    promptVisible = "";
    continuationVisible = "";
    constructor(options = {}) {
        this.history = new HistoryController(options.historySize ?? 10);
        this.maxAutocompleteEntries = options.maxAutocompleteEntries ?? 100;
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // xterm.js Addon API
    // ─────────────────────────────────────────────────────────────────────────────
    activate(term) {
        this.term = term;
        this.attach();
    }
    dispose() {
        this.detach();
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────────
    /** Detach the controller from the terminal */
    detach() {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables = [];
    }
    /** Attach controller to the terminal */
    attach() {
        if (!this.term)
            return;
        this.disposables.push(this.term.onData(this.handleTermData));
        this.disposables.push(this.term.onResize(this.handleTermResize));
        this.termSize = {
            cols: this.term.cols,
            rows: this.term.rows,
        };
    }
    /** Register an autocomplete handler */
    addAutocompleteHandler(fn, ...args) {
        this.autocompleteHandlers.push({ fn, args });
    }
    /** Remove a previously registered autocomplete handler */
    removeAutocompleteHandler(fn) {
        const idx = this.autocompleteHandlers.findIndex((h) => h.fn === fn);
        if (idx !== -1) {
            this.autocompleteHandlers.splice(idx, 1);
        }
    }
    /**
     * Read a line of input from the user.
     * Returns a promise that resolves when Enter is pressed.
     */
    read(prompt, continuationPrompt = "> ") {
        return new Promise((resolve, reject) => {
            this.term?.write(prompt);
            this.promptVisible = stripAnsi(prompt);
            this.continuationVisible = stripAnsi(continuationPrompt);
            this.activePrompt = { prompt, continuationPrompt, resolve, reject };
            this.input = "";
            this.cursor = 0;
            this.active = true;
        });
    }
    /**
     * Read a single character from the user.
     * Takes priority over any active read() operation.
     */
    readChar(prompt) {
        return new Promise((resolve, reject) => {
            this.term?.write(prompt);
            this.activeCharPrompt = { prompt, resolve, reject };
        });
    }
    /** Abort any pending read operation */
    abortRead(reason = "aborted") {
        if (this.activePrompt || this.activeCharPrompt) {
            this.term?.write(ANSI.NEWLINE);
        }
        if (this.activePrompt) {
            this.activePrompt.reject(reason);
            this.activePrompt = null;
        }
        if (this.activeCharPrompt) {
            this.activeCharPrompt.reject(reason);
            this.activeCharPrompt = null;
        }
        this.active = false;
        this.promptVisible = "";
        this.continuationVisible = "";
    }
    /** Print a message followed by newline */
    println(message) {
        this.print(message + "\n");
    }
    /** Print a message, converting newlines properly */
    print(message) {
        const normalized = message.replace(/[\r\n]+/g, "\n");
        this.term?.write(normalized.replace(/\n/g, ANSI.NEWLINE));
    }
    /** Print items in wide column format */
    printWide(items, padding = 2) {
        if (items.length === 0) {
            this.println("");
            return;
        }
        const maxWidth = Math.max(...items.map((item) => item.length));
        const itemWidth = maxWidth + padding;
        const cols = Math.floor(this.termSize.cols / itemWidth);
        const rows = Math.ceil(items.length / cols);
        let itemIndex = 0;
        for (let row = 0; row < rows; row++) {
            let rowStr = "";
            for (let col = 0; col < cols && itemIndex < items.length; col++) {
                const item = items[itemIndex++];
                rowStr += item?.padEnd(itemWidth);
            }
            this.println(rowStr);
        }
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Internal Methods - Prompt Handling
    // ─────────────────────────────────────────────────────────────────────────────
    /** Apply prompt prefixes to input for display */
    applyPrompts(input, mode = "raw") {
        const prompt = mode === "raw"
            ? (this.activePrompt?.prompt ?? "")
            : this.promptVisible || stripAnsi(this.activePrompt?.prompt ?? "");
        const continuation = mode === "raw"
            ? (this.activePrompt?.continuationPrompt ?? "")
            : this.continuationVisible ||
                stripAnsi(this.activePrompt?.continuationPrompt ?? "");
        return prompt + input.replace(/\n/g, "\n" + continuation);
    }
    /** Calculate display offset accounting for prompt length */
    applyPromptOffset(input, offset) {
        const withPrompt = this.applyPrompts(input.substring(0, offset), "visible");
        return withPrompt.length;
    }
    /** Clear the current input display */
    clearInput() {
        const currentPrompt = this.applyPrompts(this.input, "visible");
        const allRows = countLines(currentPrompt, this.termSize.cols);
        const promptCursor = this.applyPromptOffset(this.input, this.cursor);
        const { row } = offsetToColRow(currentPrompt, promptCursor, this.termSize.cols);
        // Move to the last row
        const moveRows = allRows - row - 1;
        for (let i = 0; i < moveRows; i++) {
            this.term?.write(ANSI.CURSOR_NEXT_LINE);
        }
        // Clear all lines
        this.term?.write(ANSI.CARRIAGE_RETURN + ANSI.ERASE_LINE);
        for (let i = 1; i < allRows; i++) {
            this.term?.write(ANSI.CURSOR_PREV_LINE + ANSI.ERASE_LINE);
        }
    }
    /** Replace input with new content */
    setInput(newInput, clearFirst = true) {
        if (clearFirst)
            this.clearInput();
        const renderedPrompt = this.applyPrompts(newInput);
        const visiblePrompt = this.applyPrompts(newInput, "visible");
        this.print(renderedPrompt);
        // Clamp cursor to new input length
        if (this.cursor > newInput.length) {
            this.cursor = newInput.length;
        }
        // Position cursor correctly
        const newCursor = this.applyPromptOffset(newInput, this.cursor);
        const newLines = countLines(visiblePrompt, this.termSize.cols);
        const { col, row } = offsetToColRow(visiblePrompt, newCursor, this.termSize.cols);
        const moveUpRows = newLines - row - 1;
        this.term?.write(ANSI.CARRIAGE_RETURN);
        for (let i = 0; i < moveUpRows; i++) {
            this.term?.write(ANSI.CURSOR_PREV_LINE);
        }
        for (let i = 0; i < col; i++) {
            this.term?.write(ANSI.CURSOR_RIGHT);
        }
        this.input = newInput;
    }
    /** Print output and restart the prompt */
    printAndRestartPrompt(callback) {
        const savedCursor = this.cursor;
        this.setCursor(this.input.length);
        this.term?.write(ANSI.NEWLINE);
        const resume = () => {
            this.cursor = savedCursor;
            this.setInput(this.input);
        };
        const result = callback();
        if (result instanceof Promise) {
            void result.then(resume);
        }
        else {
            resume();
        }
    }
    /** Set cursor position in the input */
    setCursor(newCursor) {
        newCursor = Math.max(0, Math.min(newCursor, this.input.length));
        const inputWithPrompt = this.applyPrompts(this.input, "visible");
        // Calculate previous position
        const prevOffset = this.applyPromptOffset(this.input, this.cursor);
        const { col: prevCol, row: prevRow } = offsetToColRow(inputWithPrompt, prevOffset, this.termSize.cols);
        // Calculate new position
        const newOffset = this.applyPromptOffset(this.input, newCursor);
        const { col: newCol, row: newRow } = offsetToColRow(inputWithPrompt, newOffset, this.termSize.cols);
        // Move vertically
        if (newRow > prevRow) {
            for (let i = prevRow; i < newRow; i++)
                this.term?.write(ANSI.CURSOR_DOWN);
        }
        else {
            for (let i = newRow; i < prevRow; i++)
                this.term?.write(ANSI.CURSOR_UP);
        }
        // Move horizontally
        if (newCol > prevCol) {
            for (let i = prevCol; i < newCol; i++)
                this.term?.write(ANSI.CURSOR_RIGHT);
        }
        else {
            for (let i = newCol; i < prevCol; i++)
                this.term?.write(ANSI.CURSOR_LEFT);
        }
        this.cursor = newCursor;
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Internal Methods - Cursor Operations
    // ─────────────────────────────────────────────────────────────────────────────
    /** Move cursor by given amount */
    handleCursorMove(direction) {
        if (direction > 0) {
            const delta = Math.min(direction, this.input.length - this.cursor);
            this.setCursor(this.cursor + delta);
        }
        else if (direction < 0) {
            const delta = Math.max(direction, -this.cursor);
            this.setCursor(this.cursor + delta);
        }
    }
    /** Erase character at cursor */
    handleCursorErase(backspace) {
        if (backspace) {
            if (this.cursor <= 0)
                return;
            const newInput = this.input.substring(0, this.cursor - 1) +
                this.input.substring(this.cursor);
            this.clearInput();
            this.cursor -= 1;
            this.setInput(newInput, false);
        }
        else {
            const newInput = this.input.substring(0, this.cursor) +
                this.input.substring(this.cursor + 1);
            this.setInput(newInput);
        }
    }
    /** Insert text at cursor */
    handleCursorInsert(data) {
        const newInput = this.input.substring(0, this.cursor) +
            data +
            this.input.substring(this.cursor);
        this.cursor += data.length;
        this.setInput(newInput);
    }
    /** Handle input completion (Enter pressed) */
    handleReadComplete() {
        this.history.push(this.input);
        if (this.activePrompt) {
            this.activePrompt.resolve(this.input);
            this.activePrompt = null;
        }
        this.term?.write(ANSI.NEWLINE);
        this.active = false;
        this.promptVisible = "";
        this.continuationVisible = "";
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Internal Methods - Event Handlers
    // ─────────────────────────────────────────────────────────────────────────────
    /** Handle terminal resize */
    handleTermResize = (data) => {
        this.clearInput();
        this.termSize = { cols: data.cols, rows: data.rows };
        this.setInput(this.input, false);
    };
    /** Handle terminal data input */
    handleTermData = (data) => {
        if (!this.active)
            return;
        // Character prompt takes priority
        if (this.activeCharPrompt) {
            this.activeCharPrompt.resolve(data);
            this.activeCharPrompt = null;
            this.term?.write(ANSI.NEWLINE);
            return;
        }
        // Handle pasted input
        if (data.length > 3 && data.charCodeAt(0) !== KEY.ESCAPE) {
            const normalized = data.replace(/[\r\n]+/g, "\r");
            for (const char of normalized) {
                this.handleData(char);
            }
        }
        else {
            this.handleData(data);
        }
    };
    /** Handle a single input character or sequence */
    handleData(data) {
        if (!this.active)
            return;
        const ord = data.charCodeAt(0);
        // Handle escape sequences
        if (ord === KEY.ESCAPE) {
            this.handleEscapeSequence(data.substring(1));
            return;
        }
        // Handle control characters
        if (ord < 32 || ord === KEY.BACKSPACE) {
            this.handleControlChar(data);
            return;
        }
        // Insert visible character
        this.handleCursorInsert(data);
    }
    /** Handle ANSI escape sequences */
    handleEscapeSequence(seq) {
        switch (seq) {
            case ESCAPE_SEQ.UP:
                this.handleHistoryPrevious();
                break;
            case ESCAPE_SEQ.DOWN:
                this.handleHistoryNext();
                break;
            case ESCAPE_SEQ.LEFT:
                this.handleCursorMove(-1);
                break;
            case ESCAPE_SEQ.RIGHT:
                this.handleCursorMove(1);
                break;
            case ESCAPE_SEQ.DELETE:
                this.handleCursorErase(false);
                break;
            case ESCAPE_SEQ.END:
                this.setCursor(this.input.length);
                break;
            case ESCAPE_SEQ.HOME:
                this.setCursor(0);
                break;
            case ESCAPE_SEQ.ALT_LEFT: {
                const pos = closestLeftBoundary(this.input, this.cursor);
                this.setCursor(pos);
                break;
            }
            case ESCAPE_SEQ.ALT_RIGHT: {
                const pos = closestRightBoundary(this.input, this.cursor);
                this.setCursor(pos);
                break;
            }
            case ESCAPE_SEQ.ALT_BACKSPACE: {
                const pos = closestLeftBoundary(this.input, this.cursor);
                this.setInput(this.input.substring(0, pos) + this.input.substring(this.cursor));
                this.setCursor(pos);
                break;
            }
        }
    }
    /** Handle control characters */
    handleControlChar(data) {
        switch (data) {
            case KEY.ENTER:
                if (isIncompleteInput(this.input)) {
                    this.handleCursorInsert("\n");
                }
                else {
                    this.handleReadComplete();
                }
                break;
            case String.fromCharCode(KEY.BACKSPACE):
                this.handleCursorErase(true);
                break;
            case KEY.TAB:
                this.handleTab();
                break;
            case KEY.CTRL_C:
                this.handleCtrlC();
                break;
        }
    }
    /** Handle history navigation (up arrow) */
    handleHistoryPrevious() {
        const value = this.history.getPrevious();
        if (value) {
            this.setInput(value);
            this.setCursor(value.length);
        }
    }
    /** Handle history navigation (down arrow) */
    handleHistoryNext() {
        const value = this.history.getNext() ?? "";
        this.setInput(value);
        this.setCursor(value.length);
    }
    /** Handle tab completion */
    handleTab() {
        if (this.autocompleteHandlers.length === 0) {
            this.handleCursorInsert("    ");
            return;
        }
        const inputFragment = this.input.substring(0, this.cursor);
        const hasTrailingSpace = hasTailingWhitespace(inputFragment);
        const candidates = collectAutocompleteCandidates(this.autocompleteHandlers, inputFragment);
        candidates.sort();
        if (candidates.length === 0) {
            // No matches - add space if none exists
            if (!hasTrailingSpace) {
                this.handleCursorInsert(" ");
            }
        }
        else if (candidates.length === 1) {
            // Single match - complete it
            const lastToken = getLastToken(inputFragment);
            this.handleCursorInsert(candidates[0]?.substring(lastToken.length) + " ");
        }
        else if (candidates.length <= this.maxAutocompleteEntries) {
            // Multiple matches - try partial completion
            const sharedFragment = getSharedFragment(inputFragment, candidates);
            if (sharedFragment) {
                const lastToken = getLastToken(inputFragment);
                this.handleCursorInsert(sharedFragment.substring(lastToken.length));
            }
            // Show candidates
            this.printAndRestartPrompt(() => {
                this.printWide(candidates);
            });
        }
        else {
            // Too many matches - ask for confirmation
            this.printAndRestartPrompt(async () => {
                const answer = await this.readChar(`Display all ${candidates.length} possibilities? (y or n)`);
                if (answer === "y" || answer === "Y") {
                    this.printWide(candidates);
                }
            });
        }
    }
    /** Handle Ctrl+C interrupt */
    handleCtrlC() {
        this.setCursor(this.input.length);
        const prompt = this.activePrompt?.prompt ?? "";
        this.term?.write("^C" + ANSI.NEWLINE + prompt);
        this.input = "";
        this.cursor = 0;
        this.history.rewind();
    }
}
