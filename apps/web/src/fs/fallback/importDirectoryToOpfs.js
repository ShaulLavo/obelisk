import { OPFS_ROOT_NAME } from '../config/constants';
import { deriveRelativeSegments, getSharedTopSegment, normalizeEntries } from './importDirectoryEntries';
const TEMP_DIR_NAME = `${OPFS_ROOT_NAME}_temp_import`;
const BACKUP_DIR_NAME = `${OPFS_ROOT_NAME}_backup`;
const hasOpfsAccess = () => {
    return (typeof navigator !== 'undefined' &&
        typeof navigator.storage?.getDirectory === 'function');
};
const clearDirectory = async (root) => {
    const directory = root;
    const iterator = directory.entries?.();
    if (!iterator)
        return;
    for await (const [name, handle] of iterator) {
        await root.removeEntry(name, {
            recursive: handle.kind === 'directory'
        });
    }
};
/**
 * Safely removes a directory entry if it exists.
 * Returns true if removed, false if it didn't exist.
 */
const safeRemoveEntry = async (parent, name) => {
    try {
        await parent.removeEntry(name, { recursive: true });
        return true;
    }
    catch {
        // Entry doesn't exist or already removed
        return false;
    }
};
/**
 * Checks if a directory exists and has entries.
 */
const directoryHasEntries = async (parent, name) => {
    try {
        const dir = await parent.getDirectoryHandle(name, { create: false });
        const directory = dir;
        const iterator = directory.entries?.();
        if (!iterator)
            return false;
        const first = await iterator.next();
        return !first.done;
    }
    catch {
        return false;
    }
};
/**
 * Recursively copies all contents from source to destination directory.
 */
const copyDirectoryContents = async (source, destination) => {
    const sourceDir = source;
    const iterator = sourceDir.entries?.();
    if (!iterator)
        return;
    for await (const [name, handle] of iterator) {
        if (handle.kind === 'directory') {
            const sourceSubDir = await source.getDirectoryHandle(name);
            const destSubDir = await destination.getDirectoryHandle(name, {
                create: true
            });
            await copyDirectoryContents(sourceSubDir, destSubDir);
        }
        else {
            const fileHandle = await source.getFileHandle(name);
            const file = await fileHandle.getFile();
            const destFileHandle = await destination.getFileHandle(name, {
                create: true
            });
            const writable = await destFileHandle.createWritable();
            await writable.write(await file.arrayBuffer());
            await writable.close();
        }
    }
};
const ensureDirectory = async (root, segments) => {
    let current = root;
    for (const segment of segments) {
        current = await current.getDirectoryHandle(segment, { create: true });
    }
    return current;
};
const writeFileToOpfs = async (root, segments, file) => {
    const directorySegments = segments.slice(0, -1);
    const fileName = segments[segments.length - 1];
    const targetDir = await ensureDirectory(root, directorySegments);
    const handle = await targetDir.getFileHandle(fileName ?? file.name, {
        create: true
    });
    const writable = await handle.createWritable();
    const buffer = await file.arrayBuffer();
    await writable.write(buffer);
    await writable.close();
};
/**
 * Imports a directory to OPFS with safe write semantics.
 *
 * By default (skipClear: false), this performs a destructive import:
 * 1. Writes all files to a temporary directory first
 * 2. If all writes succeed, backs up the existing appRoot
 * 3. Atomically moves temp directory contents to appRoot
 * 4. Cleans up backup on success
 * 5. On any failure, restores from backup and cleans up temp
 *
 * With skipClear: true, files are merged into the existing directory.
 */
export async function importDirectoryToOpfs(files, options = {}) {
    const { skipClear = false, confirmDestructive } = options;
    if (!hasOpfsAccess()) {
        throw new Error('OPFS is not supported in this browser.');
    }
    const entries = normalizeEntries(files);
    if (entries.length === 0) {
        throw new Error('No files provided for import.');
    }
    const storage = navigator.storage;
    if (!storage?.getDirectory) {
        throw new Error('OPFS is not supported in this browser.');
    }
    const storageRoot = await storage.getDirectory();
    // If skipClear is true, we just merge files into the existing directory
    if (skipClear) {
        const appRoot = await storageRoot.getDirectoryHandle(OPFS_ROOT_NAME, {
            create: true
        });
        const sharedTop = getSharedTopSegment(entries);
        for (const entry of entries) {
            const segments = deriveRelativeSegments(entry, sharedTop);
            await writeFileToOpfs(appRoot, segments, entry.file);
        }
        return appRoot;
    }
    // Destructive import - check for confirmation if existing data would be lost
    const hasExistingData = await directoryHasEntries(storageRoot, OPFS_ROOT_NAME);
    if (hasExistingData && confirmDestructive) {
        const confirmed = await confirmDestructive();
        if (!confirmed) {
            throw new Error('Import cancelled by user confirmation.');
        }
    }
    // Clean up any leftover temp/backup directories from previous failed imports
    await safeRemoveEntry(storageRoot, TEMP_DIR_NAME);
    await safeRemoveEntry(storageRoot, BACKUP_DIR_NAME);
    // Create temporary directory for writing new files
    const tempDir = await storageRoot.getDirectoryHandle(TEMP_DIR_NAME, {
        create: true
    });
    const sharedTop = getSharedTopSegment(entries);
    try {
        // Write all files to temp directory first
        for (const entry of entries) {
            const segments = deriveRelativeSegments(entry, sharedTop);
            await writeFileToOpfs(tempDir, segments, entry.file);
        }
        // All writes succeeded - now do the atomic swap
        // Step 1: Create backup of existing appRoot (if it has data)
        if (hasExistingData) {
            const appRoot = await storageRoot.getDirectoryHandle(OPFS_ROOT_NAME);
            const backupDir = await storageRoot.getDirectoryHandle(BACKUP_DIR_NAME, {
                create: true
            });
            await copyDirectoryContents(appRoot, backupDir);
        }
        try {
            // Step 2: Clear appRoot and copy temp contents to it
            const appRoot = await storageRoot.getDirectoryHandle(OPFS_ROOT_NAME, {
                create: true
            });
            await clearDirectory(appRoot);
            await copyDirectoryContents(tempDir, appRoot);
            // Step 3: Clean up temp and backup directories on success
            await safeRemoveEntry(storageRoot, TEMP_DIR_NAME);
            await safeRemoveEntry(storageRoot, BACKUP_DIR_NAME);
            return appRoot;
        }
        catch (swapError) {
            // Swap failed - try to restore from backup
            if (hasExistingData) {
                try {
                    const appRoot = await storageRoot.getDirectoryHandle(OPFS_ROOT_NAME, {
                        create: true
                    });
                    await clearDirectory(appRoot);
                    const backupDir = await storageRoot.getDirectoryHandle(BACKUP_DIR_NAME);
                    await copyDirectoryContents(backupDir, appRoot);
                }
                catch (restoreError) {
                    // If restore also fails, throw a combined error
                    throw new Error(`Import failed and restore from backup also failed. ` +
                        `Original error: ${swapError instanceof Error ? swapError.message : String(swapError)}. ` +
                        `Restore error: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}. ` +
                        `Backup may still exist as "${BACKUP_DIR_NAME}".`);
                }
            }
            // Clean up temp directory
            await safeRemoveEntry(storageRoot, TEMP_DIR_NAME);
            await safeRemoveEntry(storageRoot, BACKUP_DIR_NAME);
            throw swapError;
        }
    }
    catch (writeError) {
        // Writing to temp directory failed - clean up temp and keep original intact
        await safeRemoveEntry(storageRoot, TEMP_DIR_NAME);
        throw writeError;
    }
}
export { hasOpfsAccess };
