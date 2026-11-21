#!/usr/bin/env node
// One tool for driving Tripwire on a phone. Native surfaces (permission
// dialogs, the USSD window) go through adb; the app UI goes through the
// WebView's DevTools protocol, so a step names an element instead of a screen
// coordinate. The debug build exposes that socket; a release build does not.
//
//   node scripts/phone.mjs status
//   node scripts/phone.mjs open settings
//   node scripts/phone.mjs tap "Import SMS"
//   node scripts/phone.mjs swipe up
//   node scripts/phone.mjs read
//   node scripts/phone.mjs shot /tmp/opencode/settings.png
//
// Run with --mcp to serve the same actions as an MCP server on stdio
// (registered in opencode.json). ANDROID_SERIAL picks a device when more than
// one is attached.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const APP_ID = "com.tripwire.app.debug";
const MAIN_ACTIVITY = "com.wails.app.MainActivity";
const APP_HOST = "wails.localhost";
const SHOT = "/tmp/opencode/tripwire.png";
const SCREEN = "/tmp/opencode/tripwire-screen.png";
const debug = process.env.PHONE_DEBUG
	? (...parts) => console.error("[phone]", ...parts)
	: () => {};

const PAGES = {
	home: "/",
	dashboard: "/",
	transactions: "/transactions",
	insights: "/insights",
	sms: "/sms",
	categories: "/categories",
	send: "/send",
	pay: "/send",
	lipa: "/lipa",
	settings: "/settings",
};

const KEYS = {
	back: "KEYCODE_BACK",
	home: "KEYCODE_HOME",
	enter: "KEYCODE_ENTER",
	recents: "KEYCODE_APP_SWITCH",
	wake: "KEYCODE_WAKEUP",
};

function pickSerial() {
	if (process.env.ANDROID_SERIAL) return process.env.ANDROID_SERIAL;
	const rows = execFileSync("adb", ["devices"], { encoding: "utf8" })
		.split("\n")
		.slice(1)
		.map((line) => line.trim().split(/\s+/))
		.filter(([id, state]) => id && state === "device");
	if (rows.length === 0) throw new Error("no phone attached; run adb devices");
	const physical = rows.find(([id]) => !id.startsWith("emulator-"));
	return (physical ?? rows[0])[0];
}

let serial = null;
function adb(...args) {
	serial ??= pickSerial();
	return execFileSync("adb", ["-s", serial, ...args], {
		encoding: "utf8",
		maxBuffer: 1 << 25,
	});
}
function adbQuiet(...args) {
	try {
		return adb(...args);
	} catch {
		return "";
	}
}

async function listPages(port) {
	const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
		signal: AbortSignal.timeout(5000),
	});
	if (!res.ok) throw new Error(`devtools list returned ${res.status}`);
	return res.json();
}

class Cdp {
	static async open(url) {
		const socket = new WebSocket(url);
		await new Promise((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error("timed out opening the WebView socket")),
				5000,
			);
			socket.onopen = () => {
				clearTimeout(timer);
				resolve();
			};
			socket.onerror = () => {
				clearTimeout(timer);
				reject(new Error("cannot reach the WebView"));
			};
		});
		return new Cdp(socket);
	}

	constructor(socket) {
		this.socket = socket;
		this.nextId = 1;
		this.pending = new Map();
		this.errors = [];
		socket.onmessage = (event) => {
			const message = JSON.parse(event.data);
			if (message.id) {
				const waiter = this.pending.get(message.id);
				if (!waiter) return;
				this.pending.delete(message.id);
				if (message.error) waiter.reject(new Error(message.error.message));
				else waiter.resolve(message.result);
				return;
			}
			this.collect(message);
		};
		socket.onclose = () => {
			for (const waiter of this.pending.values()) {
				const error = new Error("devtools connection closed");
				error.retryable = true;
				waiter.reject(error);
			}
			this.pending.clear();
		};
	}

	collect(message) {
		if (message.method === "Runtime.exceptionThrown") {
			this.errors.push(
				message.params.exceptionDetails.exception?.description ??
					message.params.exceptionDetails.text,
			);
		}
		if (
			message.method === "Runtime.consoleAPICalled" &&
			message.params.type === "error"
		) {
			this.errors.push(
				message.params.args
					.map((arg) => arg.value ?? arg.description ?? arg.type)
					.join(" "),
			);
		}
		if (
			message.method === "Log.entryAdded" &&
			message.params.entry.level === "error"
		) {
			this.errors.push(message.params.entry.text);
		}
	}

	send(method, params = {}) {
		const id = this.nextId++;
		this.socket.send(JSON.stringify({ id, method, params }));
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`${method} timed out`));
			}, 20_000);
			this.pending.set(id, {
				resolve: (value) => {
					clearTimeout(timer);
					resolve(value);
				},
				reject: (error) => {
					clearTimeout(timer);
					reject(error);
				},
			});
		});
	}

	async evaluate(expression) {
		const reply = await this.send("Runtime.evaluate", {
			expression,
			awaitPromise: true,
			returnByValue: true,
			userGesture: true,
		});
		if (reply.exceptionDetails) {
			throw new Error(
				reply.exceptionDetails.exception?.description ??
					reply.exceptionDetails.text,
			);
		}
		return reply.result.value;
	}

	close() {
		this.socket.close();
	}
}

let page = null;
process.on("exit", () => {
	if (!page) return;
	try {
		execFileSync("adb", ["-s", serial ?? pickSerial(), "forward", "--remove", `tcp:${page.port}`]);
	} catch {
		/* device gone */
	}
});

async function pageHandle() {
	if (page) return page.cdp;
	const unix = adbQuiet("shell", "cat", "/proc/net/unix");
	const sockets = [...new Set(unix.match(/webview_devtools_remote_\d+/g) ?? [])];
	debug("sockets", sockets.join(", ") || "none");
	for (const socket of sockets) {
		const port = Number(adb("forward", "tcp:0", `localabstract:${socket}`).trim());
		debug("forward", socket, "->", port);
		let pages = [];
		try {
			pages = await listPages(port);
		} catch (error) {
			debug("list failed", error.message);
		}
		debug("pages", pages.map((entry) => entry.url).join(", ") || "none");
		const target =
			pages.find((entry) => (entry.url ?? "").includes(APP_HOST)) ??
			(pages.length === 1 ? pages[0] : null);
		if (target) {
			const cdp = await Cdp.open(target.webSocketDebuggerUrl);
			debug("socket open");
			await cdp.send("Runtime.enable");
			await cdp.send("Log.enable");
			await cdp.send("Page.enable").catch(() => {});
			page = { cdp, port };
			return cdp;
		}
		adbQuiet("forward", "--remove", `tcp:${port}`);
	}
	throw new Error("no debuggable Tripwire WebView; is the debug build open?");
}

async function dropPage() {
	if (page) {
		try {
			page.cdp.close();
		} catch {
			/* already gone */
		}
		adbQuiet("forward", "--remove", `tcp:${page.port}`);
		page = null;
	}
}

async function withPage(run) {
	try {
		return await run(await pageHandle());
	} catch (error) {
		if (!error.retryable) throw error;
		await dropPage();
		return run(await pageHandle());
	}
}

async function settle(cdp, extra = 150) {
	await sleep(extra);
	await cdp
		.evaluate(
			"new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
		)
		.catch(() => {});
}

const route = (cdp) => cdp.evaluate("location.hash || '#/'");
const toast = (cdp) =>
	cdp.evaluate(
		'document.querySelector("[data-sonner-toast]")?.innerText ?? null',
	);

const HIT = (target, bySelector) => `(() => {
  const target = ${JSON.stringify(target)};
  const norm = (value) => (value ?? "").replace(/\\s+/g, " ").trim();
  const visible = (el) => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return box.width > 2 && box.height > 2 && style.visibility !== "hidden";
  };
  const clickable = (el) =>
    el.matches("button, a, [role=button], [role=tab], [role=switch], [role=checkbox], [role=menuitem], label, summary, input, textarea, select");
  let best = null;
  const consider = (el, score) => {
    if (!best || score > best.score) best = { el, score };
  };
  if (${bySelector}) {
    const el = document.querySelector(target);
    if (el && visible(el)) consider(el, 1);
  } else {
    const wanted = norm(target).toLowerCase();
    for (const el of document.querySelectorAll("body *")) {
      if (!visible(el)) continue;
      const label = norm(
        el.getAttribute("aria-label") ||
          el.innerText ||
          (el instanceof HTMLInputElement ? el.value : ""),
      );
      if (!label) continue;
      const lower = label.toLowerCase();
      const exact = lower === wanted;
      if (!exact && !lower.includes(wanted)) continue;
      consider(
        el,
        (exact ? 1000 : 0) +
          (clickable(el) ? 100 : 0) -
          Math.min(el.querySelectorAll("*").length, 60),
      );
    }
  }
  if (!best) return null;
  best.el.scrollIntoView({ block: "center", inline: "center" });
  const box = best.el.getBoundingClientRect();
  return {
    x: Math.round(box.left + box.width / 2),
    y: Math.round(box.top + box.height / 2),
    tag: best.el.tagName.toLowerCase(),
    label: norm(best.el.getAttribute("aria-label") || best.el.innerText).slice(0, 80),
  };
})()`;

async function appRunning() {
	serial ??= pickSerial();
	if (adbQuiet("shell", "pidof", APP_ID).trim()) return true;
	return adbQuiet("shell", "ps", "-A").includes(APP_ID);
}

async function status() {
	const running = await appRunning();
	let current = null;
	let commands = null;
	if (running) {
		try {
			current = await withPage(async (cdp) => ({
				route: await route(cdp),
				commands: await cdp.evaluate("typeof window.tripwire?.run === 'function'"),
			}));
			commands = current.commands;
		} catch {
			/* the WebView may still be starting */
		}
	}
	return {
		device: serial ?? pickSerial(),
		model: adbQuiet("shell", "getprop", "ro.product.model").trim(),
		android: adbQuiet("shell", "getprop", "ro.build.version.release").trim(),
		app: running ? "running" : "stopped",
		route: current?.route ?? null,
		devCommands: commands,
	};
}

async function launch({ fresh } = {}) {
	adb("shell", "am", "force-stop", APP_ID);
	if (fresh) adb("shell", "pm", "clear", APP_ID);
	await dropPage();
	adb("shell", "am", "start", "-W", "-n", `${APP_ID}/${MAIN_ACTIVITY}`);
	const cdp = await withPage(async (cdp) => {
		const started = Date.now();
		while (Date.now() - started < 30_000) {
			const ready = await cdp.evaluate(
				'document.querySelector("main") !== null',
			);
			if (ready) return cdp;
			await sleep(300);
		}
		throw new Error("the app shell did not render within 30s");
	});
	await settle(cdp, 400);
	return `launched ${APP_ID}${fresh ? " with cleared data" : ""}`;
}

async function open(name) {
	const path = PAGES[String(name).toLowerCase().replace(/^\//, "")];
	if (!path) {
		throw new Error(`unknown page ${name}; try ${Object.keys(PAGES).join(", ")}`);
	}
	return withPage(async (cdp) => {
		await cdp.evaluate(
			`window.tripwire.run("goto", [${JSON.stringify(path)}])`,
		);
		await settle(cdp, 250);
		return `at ${await route(cdp)}`;
	});
}

async function tap(text) {
	return withPage(async (cdp) => {
		const target = String(text);
		const bySelector =
			target.startsWith("css:") ||
			target.startsWith("#") ||
			target.startsWith(".");
		const query = target.startsWith("css:") ? target.slice(4) : target;
		const hit = await cdp.evaluate(HIT(query, bySelector));
		if (!hit) throw new Error(`nothing on screen matches ${JSON.stringify(target)}`);
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [{ x: hit.x, y: hit.y }],
		});
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchEnd",
			touchPoints: [],
		});
		await settle(cdp, 300);
		const shown = await toast(cdp);
		const at = await route(cdp);
		return [
			`tapped ${hit.tag} ${JSON.stringify(hit.label)} at ${hit.x},${hit.y}`,
			`at ${at}`,
			shown ? `toast ${JSON.stringify(shown)}` : null,
		]
			.filter(Boolean)
			.join("; ");
	});
}

async function swipe(direction, distance) {
	const dir = String(direction).toLowerCase();
	if (!["up", "down", "left", "right"].includes(dir)) {
		throw new Error("direction is up, down, left, or right");
	}
	return withPage(async (cdp) => {
		const box = await cdp.evaluate(
			"({ width: innerWidth, height: innerHeight })",
		);
		const travel = Number(distance) || Math.round(box.height * 0.4);
		const centerX = Math.round(box.width / 2);
		const centerY = Math.round(box.height / 2);
		const steps = [
			["up", 0, -1],
			["down", 0, 1],
			["left", -1, 0],
			["right", 1, 0],
		].find(([name]) => name === dir);
		const from = {
			x: centerX - (steps[1] * travel) / 2,
			y: centerY - (steps[2] * travel) / 2,
		};
		const to = {
			x: centerX + (steps[1] * travel) / 2,
			y: centerY + (steps[2] * travel) / 2,
		};
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [{ x: Math.round(from.x), y: Math.round(from.y) }],
		});
		for (let step = 1; step <= 8; step += 1) {
			const x = from.x + ((to.x - from.x) * step) / 8;
			const y = from.y + ((to.y - from.y) * step) / 8;
			await cdp.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [{ x: Math.round(x), y: Math.round(y) }],
			});
			await sleep(12);
		}
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchEnd",
			touchPoints: [],
		});
		await settle(cdp, 500);
		const scrolled = await cdp.evaluate(
			"({ y: window.scrollY, main: document.querySelector('main')?.scrollTop ?? null })",
		);
		return `swiped ${dir}; scrollY ${scrolled.y}, main ${scrolled.main}`;
	});
}

async function type(text) {
	return withPage(async (cdp) => {
		const focused = await cdp.evaluate(
			'document.activeElement?.getAttribute("aria-label") || document.activeElement?.getAttribute("placeholder") || document.activeElement?.tagName || "nothing"',
		);
		if (focused === "BODY" || focused === "nothing") {
			throw new Error("no field is focused; tap the field first");
		}
		await cdp.send("Input.insertText", { text: String(text) });
		await settle(cdp, 100);
		return `typed into ${focused}`;
	});
}

async function read(max) {
	const cap = Number(max) || 4000;
	return withPage(async (cdp) => {
		const text = await cdp.evaluate("document.body.innerText");
		const collapsed = text
			.replace(/\n{3,}/g, "\n\n")
			.split("\n")
			.map((line) => line.trimEnd())
			.join("\n")
			.trim();
		const body =
			collapsed.length > cap
				? `${collapsed.slice(0, cap)}\n... ${collapsed.length - cap} more characters`
				: collapsed;
		return `${await route(cdp)}\n${body}`;
	});
}

async function wait(text, timeoutMs) {
	const budget = Math.min(Number(timeoutMs) || 10_000, 60_000);
	return withPage(async (cdp) => {
		const started = Date.now();
		while (Date.now() - started < budget) {
			const found = await cdp.evaluate(
				`document.body.innerText.includes(${JSON.stringify(String(text))})`,
			);
			if (found) return `found ${JSON.stringify(String(text))} after ${Date.now() - started}ms`;
			await sleep(250);
		}
		throw new Error(`no ${JSON.stringify(String(text))} after ${budget}ms`);
	});
}

async function shot(path) {
	const file = String(path ?? SHOT);
	return withPage(async (cdp) => {
		const { data } = await cdp.send("Page.captureScreenshot", {
			format: "png",
		});
		writeFileSync(file, Buffer.from(data, "base64"));
		return file;
	});
}

async function errors() {
	return withPage(async (cdp) => {
		await settle(cdp, 200);
		const found = cdp.errors.splice(0);
		return found.length === 0 ? "no console errors" : found.join("\n");
	});
}

async function evaluate(code) {
	return withPage(async (cdp) => {
		const value = await cdp.evaluate(String(code));
		return typeof value === "string" ? value : JSON.stringify(value, null, 2);
	});
}

async function command(name, args = []) {
	return withPage(async (cdp) => {
		const available = await cdp.evaluate(
			"typeof window.tripwire?.run === 'function'",
		);
		if (!available) {
			throw new Error(
				"this build has no developer commands; install the debug APK",
			);
		}
		const result = await cdp.evaluate(
			`window.tripwire.run(${JSON.stringify(String(name))}, ${JSON.stringify(args.map(String))})`,
		);
		await settle(cdp, 250);
		return `${JSON.stringify(result)} at ${await route(cdp)}`;
	});
}

function key(name) {
	const code = KEYS[String(name).toLowerCase()];
	if (!code) throw new Error(`key is ${Object.keys(KEYS).join(", ")}`);
	adb("shell", "input", "keyevent", code);
	return `pressed ${code}`;
}

function screen(path) {
	const file = String(path ?? SCREEN);
	const png = execFileSync("adb", ["-s", serial ?? pickSerial(), "exec-out", "screencap", "-p"], {
		maxBuffer: 1 << 25,
	});
	writeFileSync(file, png);
	return file;
}

const tools = {
	status: {
		summary: "Device, app state and current route.",
		args: {},
		run: status,
	},
	launch: {
		summary: "Start the debug app, optionally clearing its data first.",
		args: { fresh: "boolean" },
		optional: ["fresh"],
		run: (input) => launch({ fresh: Boolean(input.fresh) }),
	},
	open: {
		summary: `Open a page: ${Object.keys(PAGES).join(", ")}.`,
		args: { page: "string" },
		run: (input) => open(input.page),
	},
	tap: {
		summary:
			"Touch the element with this visible text. Prefix a selector with css: to target it directly.",
		args: { text: "string" },
		run: (input) => tap(input.text),
	},
	swipe: {
		summary:
			"Swipe the page. up moves the finger up, revealing content further down.",
		args: { direction: "string", distance: "number" },
		optional: ["distance"],
		run: (input) => swipe(input.direction, input.distance),
	},
	type: {
		summary: "Insert text into the focused field.",
		args: { text: "string" },
		run: (input) => type(input.text),
	},
	read: {
		summary: "Read the visible text, capped at max characters.",
		args: { max: "number" },
		optional: ["max"],
		run: (input) => read(input.max),
	},
	wait: {
		summary: "Wait until the text is on screen.",
		args: { text: "string", timeout_ms: "number" },
		optional: ["timeout_ms"],
		run: (input) => wait(input.text, input.timeout_ms),
	},
	shot: {
		summary: "Save a PNG of the app view and return its path.",
		args: { path: "string" },
		optional: ["path"],
		run: (input) => shot(input.path),
	},
	errors: {
		summary: "Console errors and exceptions since the last call.",
		args: {},
		run: errors,
	},
	command: {
		summary:
			"Run an in-app dev command (goto, mode, privacy, dev, reset) and return its result.",
		args: { name: "string", args: "array" },
		optional: ["args"],
		run: (input) => command(input.name, input.args ?? []),
	},
	eval: {
		summary: "Run JavaScript in the WebView and return the result.",
		args: { code: "string" },
		run: (input) => evaluate(input.code),
	},
	key: {
		summary: `Press a native key: ${Object.keys(KEYS).join(", ")}.`,
		args: { name: "string" },
		run: (input) => key(input.name),
	},
	screen: {
		summary:
			"Save a full-screen PNG including native dialogs, and return its path.",
		args: { path: "string" },
		optional: ["path"],
		run: (input) => screen(input.path),
	},
};

function schema(tool) {
	const properties = {};
	for (const [name, type] of Object.entries(tool.args)) {
		properties[name] =
			type === "array"
				? { type: "array", items: { type: "string" } }
				: { type };
	}
	const optional = new Set(tool.optional ?? []);
	return {
		type: "object",
		properties,
		required: Object.keys(tool.args).filter((name) => !optional.has(name)),
		additionalProperties: false,
	};
}

async function runTool(name, input) {
	const tool = tools[name];
	if (!tool) throw new Error(`unknown tool ${name}`);
	const value = await tool.run(input ?? {});
	if (typeof value === "string") return value;
	return JSON.stringify(value, null, 2);
}

function cli(argv) {
	const positional = [];
	const flags = new Set();
	for (const arg of argv) {
		if (arg.startsWith("--")) flags.add(arg.slice(2));
		else positional.push(arg);
	}
	const name = positional.shift();
	if (!name || name === "help") {
		console.log(
			`usage: node scripts/phone.mjs <tool> [args]\n\n${Object.entries(tools)
				.map(([key, tool]) => `  ${key.padEnd(10)} ${tool.summary}`)
				.join("\n")}`,
		);
		return;
	}
	const tool = tools[name];
	if (!tool) throw new Error(`unknown tool ${name}`);
	const input = {};
	const names = Object.keys(tool.args);
	for (const param of names) {
		if (tool.args[param] === "boolean") {
			input[param] = flags.has(param);
			continue;
		}
		if (tool.args[param] === "array") {
			input[param] = positional.splice(0);
			continue;
		}
		if (positional.length === 0) continue;
		const raw = positional.shift();
		input[param] = tool.args[param] === "number" ? Number(raw) : raw;
	}
	return runTool(name, input).then(async (text) => {
		console.log(text);
		// One-shot CLI: close the socket so the process does not sit on the
		// open WebSocket until the caller's timeout.
		await dropPage();
		process.exit(0);
	});
}

function mcp() {
	let buffered = "";
	// A client that closes the pipe is a normal shutdown, not a crash.
	process.stdout.on("error", (error) => {
		if (error.code === "EPIPE") process.exit(0);
	});
	const reply = (id, result) =>
		process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
	const fail = (id, message) =>
		process.stdout.write(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id,
				error: { code: -32000, message: String(message) },
			})}\n`,
		);

	async function handle(message) {
		const { id, method, params } = message;
		if (method === "initialize") {
			reply(id, {
				protocolVersion: params?.protocolVersion ?? "2025-06-18",
				capabilities: { tools: {} },
				serverInfo: { name: "phone", version: "1.0.0" },
			});
			return;
		}
		if (method === "notifications/initialized" || id === undefined) return;
		if (method === "ping") {
			reply(id, {});
			return;
		}
		if (method === "tools/list") {
			reply(id, {
				tools: Object.entries(tools).map(([name, tool]) => ({
					name,
					description: tool.summary,
					inputSchema: schema(tool),
				})),
			});
			return;
		}
		if (method === "tools/call") {
			try {
				const text = await runTool(params.name, params.arguments ?? {});
				reply(id, { content: [{ type: "text", text }] });
			} catch (error) {
				reply(id, {
					content: [{ type: "text", text: error.message ?? String(error) }],
					isError: true,
				});
			}
			return;
		}
		fail(id, `unsupported method ${method}`);
	}

	process.stdin.setEncoding("utf8");
	let queue = Promise.resolve();
	process.stdin.on("data", (chunk) => {
		buffered += chunk;
		let newline;
		while ((newline = buffered.indexOf("\n")) !== -1) {
			const line = buffered.slice(0, newline).trim();
			buffered = buffered.slice(newline + 1);
			if (!line) continue;
			let message;
			try {
				message = JSON.parse(line);
			} catch {
				continue;
			}
			queue = queue.then(() =>
				handle(message).catch((error) => fail(message.id, error.message)),
			);
		}
	});
	// The client going away ends the session once the calls already queued
	// have answered; the page socket would otherwise keep the process alive.
	process.stdin.on("end", () => {
		queue.finally(() => dropPage().finally(() => process.exit(0)));
	});
}

if (process.argv.includes("--mcp")) mcp();
else
	Promise.resolve(cli(process.argv.slice(2))).catch(async (error) => {
		console.error(error.message ?? error);
		await dropPage();
		process.exit(1);
	});
