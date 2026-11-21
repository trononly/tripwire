import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

export interface FavouriteChip {
	id: string;
	name: string;
	active?: boolean;
	onPick: () => void;
}

export interface FavouritesRowProps {
	items: FavouriteChip[];
	onManage: () => void;
	emptyTitle?: string;
	emptyHint?: string;
	/** Chip label cap; the management sheet shows the full name. */
	max?: number;
}

export function FavouritesRow({
	items,
	onManage,
	emptyTitle = "Save your regulars",
	emptyHint = "Add a contact or number for one-tap sending",
	max = 8,
}: FavouritesRowProps) {
	const shown = items.slice(0, max);

	if (items.length === 0) {
		return (
			<button
				type="button"
				onClick={onManage}
				className="w-full rounded-xl border border-dashed border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
			>
				<span className="block text-[13px] font-medium text-foreground">
					{emptyTitle}
				</span>
				<span className="block text-xs text-muted-foreground">
					{emptyHint}
				</span>
			</button>
		);
	}

	return (
		<div className="flex flex-wrap gap-2">
			{shown.map((item) => (
				<button
					key={item.id}
					type="button"
					onClick={item.onPick}
					aria-pressed={item.active}
					className={cn(
						"min-h-9 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors",
						item.active
							? "bg-foreground text-background"
							: "bg-accent text-accent-foreground hover:bg-accent/70",
					)}
				>
					{item.name}
				</button>
			))}
			<button
				type="button"
				onClick={onManage}
				aria-label="Add favourite"
				className="flex min-h-9 items-center rounded-lg bg-accent px-2.5 text-accent-foreground transition-colors hover:bg-accent/70"
			>
				<Plus className="size-4" aria-hidden />
			</button>
		</div>
	);
}

export default FavouritesRow;
