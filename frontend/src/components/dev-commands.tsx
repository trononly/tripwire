import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { setDevMode } from "@/hooks/use-konami-code";
import { setPrivacyMode } from "@/lib/privacy-mode";
import { isDebugBuild } from "@/lib/sms-bridge";
import type { DataMode } from "@/lib/data-mode";

declare global {
	interface Window {
		/**
		 * Debug-build console commands, called from the WebView DevTools
		 * console or scripts/phone.mjs. Absent from a release build.
		 */
		tripwire?: {
			run(name: string, args?: string[]): unknown;
			list(): string[];
		};
	}
}

/**
 * Console commands for driving the app without tapping: `tripwire.run("goto",
 * ["/settings"])`. They call the same setters the UI calls, so state and
 * history match a real tap. Navigation goes through the router because a raw
 * `location.hash` change reads as a system back and the back handler bounces
 * secondary pages to the last primary tab.
 */
export function DevCommands({ onMode }: { onMode: (mode: DataMode) => void }) {
	const navigate = useNavigate();
	// App recreates setMode each render; the ref keeps the command registry
	// stable so the effect does not re-register the global every render.
	const setMode = useRef(onMode);
	setMode.current = onMode;

	const commands = useMemo(() => {
		const table: Record<string, (...args: string[]) => unknown> = {
			goto: (path = "/") => {
				const target = path.startsWith("/") ? path : `/${path}`;
				navigate(target);
				return target;
			},
			mode: (mode) => {
				const next: DataMode = mode === "statements" ? "statements" : "sms";
				setMode.current(next);
				return next;
			},
			privacy: (value) => {
				const on = value !== "off";
				setPrivacyMode(on);
				return on ? "on" : "off";
			},
			dev: (value) => {
				const on = value !== "off";
				setDevMode(on);
				return on ? "on" : "off";
			},
			reset: () => {
				localStorage.clear();
				location.reload();
				return "reloading";
			},
		};
		return table;
	}, [navigate]);

	useEffect(() => {
		if (!isDebugBuild() && !import.meta.env.DEV) return;
		window.tripwire = {
			run: (name, args = []) => {
				const command = commands[name];
				if (!command) {
					throw new Error(
						`unknown command ${name}; try ${Object.keys(commands).join(", ")}`,
					);
				}
				return command(...args);
			},
			list: () => Object.keys(commands),
		};
		return () => {
			delete window.tripwire;
		};
	}, [commands]);

	return null;
}
