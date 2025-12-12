/* eslint-disable solid/reactivity */
import { Resizable, ResizableHandle, ResizablePanel } from "@repo/ui/resizable";
import { makePersisted } from "@solid-primitives/storage";
import { createSignal } from "solid-js";
import { StatusBar } from "./components/StatusBar";
import { Terminal } from "./components/Terminal";
import { Fs } from "./fs/components/Fs";
import { dualStorage } from "./utils/DualStorage";
const Main = () => {
    const [verticalPanelSize, setVerticalPanelSize] = makePersisted(createSignal([0.65, 0.35]), {
        name: "main-vertical-panel-size",
        storage: dualStorage,
    });
    return (<main class="h-screen max-h-screen overflow-hidden bg-[#0b0c0f] text-zinc-100">
      <div class="flex h-full min-h-0 flex-col">
        <Resizable orientation="vertical" class="flex flex-1 min-h-0 flex-col" onSizesChange={(sizes) => {
            if (sizes.length !== 2)
                return;
            setVerticalPanelSize(() => [...sizes]);
        }}>
          <ResizablePanel initialSize={verticalPanelSize()[0] ?? 0.65} minSize={0.3} class="min-h-0">
            <Fs />
          </ResizablePanel>
          <ResizableHandle aria-label="Resize editor and terminal"/>
          <ResizablePanel initialSize={verticalPanelSize()[1] ?? 0.35} minSize={0.2} class="min-h-0">
            <Terminal />
          </ResizablePanel>
        </Resizable>
        <StatusBar />
      </div>
    </main>);
};
export default Main;
