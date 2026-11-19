import { useCallback, useEffect, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import { toast } from "sonner";

import { canPickContact, pickContact, type ContactPickResult } from "@/lib/sms-bridge";

/**
 * Open the system contact picker and hand exactly one result to the
 * caller. Fetching a contact and what happens to it stay separate: the
 * phone field fills its input, the favourites sheet saves, each its own
 * call. The listener registers before the picker opens because the result
 * arrives as an event, never as a return value.
 */
export function useContactPick(onPicked: (r: ContactPickResult) => void) {
	const [picking, setPicking] = useState(false);
	// The callback rides in a ref: registering the event listener again
	// whenever the caller re-created it would drop the pending pick.
	const onPickedRef = useRef(onPicked);
	useEffect(() => {
		onPickedRef.current = onPicked;
	});

	useEffect(() => {
		if (!picking) return;
		const off = Events.Once("common:contact", (ev) => {
			setPicking(false);
			const data = (ev.data ?? {}) as ContactPickResult;
			if (data.cancelled) return;
			if (!data.ok || !data.phone) {
				toast.error(data.error || "Could not read that contact.");
				return;
			}
			onPickedRef.current(data);
		});
		pickContact();
		return off;
	}, [picking]);

	const start = useCallback(() => {
		if (!canPickContact()) {
			toast.info(
				"Picking a contact needs the Android app. Add the number manually.",
			);
			return;
		}
		setPicking(true);
	}, []);

	return { picking, start };
}
