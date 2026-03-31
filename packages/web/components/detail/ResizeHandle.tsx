/**
 * Custom resize handle for the detail page split panel separator.
 *
 * Renders a thin vertical line with 3 dot indicators.
 * Styled via the parent Separator's data-separator attribute
 * (values: "inactive" | "hover" | "active").
 */
export function ResizeHandle() {
    return (
        <div className='w-px h-full bg-white/10 group-data-[separator=hover]:bg-white/25 group-data-[separator=active]:bg-emerald-500/50 transition-colors duration-150' />
    )
}
