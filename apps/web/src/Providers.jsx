import { ColorModeProvider, ColorModeScript, createLocalStorageManager, } from "@kobalte/core";
import { ThemedToaster } from "./ThemedToaster";
import { FocusProvider } from "./focus/focusManager";
import { FsProvider } from "./fs/context/FsProvider";
export const storageManager = createLocalStorageManager("ui-theme");
export const Providers = (props) => {
    return (<>
      <ColorModeScript storageType={storageManager.type}/>
      <ColorModeProvider storageManager={storageManager}>
        <FocusProvider>
          <ThemedToaster />
          <FsProvider>{props.children}</FsProvider>
        </FocusProvider>
      </ColorModeProvider>
    </>);
};
