import { useColorMode } from "@kobalte/core";
import { Toaster } from "@repo/ui/toaster";
export const ThemedToaster = () => {
    const { colorMode } = useColorMode();
    const theme = () => (colorMode() === "light" ? "light" : "dark");
    return <Toaster theme={theme()}/>;
};
