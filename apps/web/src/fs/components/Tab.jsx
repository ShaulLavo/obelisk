export const Tab = (props) => {
    const handleSelect = () => {
        props.onSelect?.(props.value);
    };
    return (<button type="button" role="tab" tabIndex={props.isActive ? 0 : -1} onClick={handleSelect} title={props.title ?? props.value} class={"flex items-center gap-2 rounded-t px-3 py-1 font-semibold transition-colors " +
            (props.isActive
                ? "bg-zinc-900 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-100")} aria-selected={props.isActive}>
      <span class="max-w-48 truncate">{props.label}</span>
    </button>);
};
