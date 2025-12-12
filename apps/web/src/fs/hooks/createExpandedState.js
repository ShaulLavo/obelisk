/* eslint-disable solid/reactivity */
import { makePersisted } from "@solid-primitives/storage";
import { createStore } from "solid-js/store";
export const createExpandedState = () => {
    const [expanded, setExpanded] = makePersisted(createStore({}), {
        name: "fs-expanded",
    });
    return {
        expanded,
        setExpanded,
    };
};
