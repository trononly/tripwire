import { formatAmountInput } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface AmountFieldProps {
	id: string;
	/** Raw digits only; grouping is display-only. */
	value: string;
	onChange: (digits: string) => void;
	invalid?: boolean;
	error?: string;
}

export function AmountField({
	id,
	value,
	onChange,
	invalid = false,
	error,
}: AmountFieldProps) {
	return (
		<div className="space-y-1.5">
			<label
				htmlFor={id}
				className="text-[13px] font-medium text-foreground"
			>
				Amount
			</label>
			<div
				className={cn(
					"flex items-baseline gap-2 rounded-xl border border-input bg-card px-4 py-3 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50",
					invalid && "border-destructive",
				)}
			>
				<span className="text-sm font-medium text-muted-foreground">
					KES
				</span>
				<input
					id={id}
					inputMode="numeric"
					autoComplete="off"
					placeholder="0"
					value={formatAmountInput(value)}
					onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
					aria-invalid={invalid}
					className="min-w-0 flex-1 bg-transparent text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums outline-none placeholder:text-muted-foreground/30"
				/>
				<span className="text-xl font-medium text-muted-foreground" aria-hidden>
					.00
				</span>
			</div>
			{error && <span className="text-xs text-destructive">{error}</span>}
		</div>
	);
}

export default AmountField;
