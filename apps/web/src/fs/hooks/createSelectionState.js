/* eslint-disable solid/reactivity */
import { makePersisted } from '@solid-primitives/storage';
import { createSignal } from 'solid-js';
import { createMemorySafeStorage } from '../../utils/safeLocalStorage';
import { DEFAULT_SOURCE } from '../config/constants';
export const createSelectionState = () => {
    const [selectedPath, setSelectedPath] = makePersisted(createSignal(undefined), {
        name: 'fs-selected-path'
    });
    const memorySafeStorage = createMemorySafeStorage();
    const [activeSource, setActiveSource] = makePersisted(createSignal(DEFAULT_SOURCE), {
        name: 'fs-active-source',
        storage: memorySafeStorage
    });
    return {
        selectedPath,
        setSelectedPath,
        activeSource,
        setActiveSource
    };
};
