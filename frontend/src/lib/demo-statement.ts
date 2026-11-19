import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";

/**
 * The onboarding demo dataset: one small, self-consistent M-Pesa history
 * the tour can spotlight on a fresh install. Descriptions follow the real
 * statement shapes Go classifies (send, till, paybill, receive, fees,
 * savings), amounts are signed cents, and the balance ledger adds up.
 * The tour seeds it through SeedDemoStatement and owns the cleanup.
 */
type Spec = [date: string, description: string, amount: number];

const OPENING_BALANCE = 4_120_00;

const ROWS: Spec[] = [
	["2026-09-01 07:31:10", "Salary Payment from TWIGA LOGISTICS LTD", 5850000],
	["2026-09-01 08:02:22", "Customer Transfer to - MARGRET NJERI 0722123456", -300000],
	["2026-09-01 08:02:23", "Customer Transfer of Funds Charge", -2900],
	["2026-09-03 13:12:45", "Merchant Payment to - Quickmart Ruaka", -184500],
	["2026-09-05 09:15:00", "Pay Bill Online to 888880 - KPLC PREPAID TOKENS", -120000],
	["2026-09-05 09:15:01", "Pay Bill Charge", -10000],
	["2026-09-08 17:44:03", "Customer Bundle Purchase to Safaricom Offers - Tunukiwa", -250000],
	["2026-09-11 19:05:31", "Funds received from - PAULINE WAMBUI 0722754093", 415000],
	["2026-09-12 10:31:19", "Merchant Payment to - Nduta Grocery", -86700],
	["2026-09-14 12:15:40", "Customer Transfer to - CALVIN KAMARA 0141663900", -1000000],
	["2026-09-14 12:15:41", "Customer Transfer of Funds Charge", -2900],
	["2026-09-17 18:20:11", "Merchant Payment to - Apple mart", -79900],
	["2026-09-20 16:40:52", "Airtime Purchase for 254712544752", -50000],
	["2026-09-23 09:22:14", "Funds received from - Divisible Inc in US via TerraPay", 6840000],
	["2026-09-24 11:11:05", "M-Shwari Withdraw", 3100000],
	["2026-09-26 15:58:33", "Merchant Payment to - Carrefour TRM", -2470000],
	["2026-09-28 20:03:47", "Customer Transfer to - ALYA MEME", -500000],
	["2026-09-28 20:03:48", "Customer Transfer of Funds Charge", -2900],
	["2026-10-01 07:29:44", "Salary Payment from TWIGA LOGISTICS LTD", 5850000],
	["2026-10-02 08:47:20", "Pay Bill Online to NCBA Bank Ltd Corporate Acc. SDR#GRENADIERPHILIP", -6000000],
	["2026-10-02 08:47:21", "Pay Bill Charge", -10000],
	["2026-10-05 18:33:57", "Merchant Payment to - Naivas Kenyatta Road", -132400],
	["2026-10-07 21:10:02", "Customer Transfer to - FAITH BACHIA", -200000],
	["2026-10-09 14:22:38", "Funds received from - CALVIN KAMARA 0141***900", 1000000],
	["2026-10-11 09:50:16", "Customer Bundle Purchase to SAFARICOM POSTPAID BUNDLES - SHook Data Daily", -310000],
	["2026-10-13 17:04:29", "Merchant Payment to - Besco Company Till 10", -3500000],
	["2026-10-15 20:41:00", "Pay Bill Online to LOOP BIZ Acc. 227719", -1700000],
	["2026-10-15 20:41:01", "Pay Bill Charge", -50000],
	["2026-10-18 08:15:44", "M-Shwari Deposit", -1000000],
	["2026-10-21 19:36:12", "Funds received from - PAULINE WAMBUI 0722754093", 2075000],
	["2026-10-23 12:58:51", "Merchant Payment to - KFC Sarit", -118000],
	["2026-10-25 16:02:35", "Customer Transfer to - ELIAS MUTUNGI", -400000],
	["2026-10-27 18:44:08", "Merchant Payment to - Apple mart", -79900],
	["2026-10-29 10:11:26", "Airtime Purchase for 254712544752", -50000],
	["2026-11-02 07:27:53", "Salary Payment from TWIGA LOGISTICS LTD", 5850000],
	["2026-11-03 09:03:17", "Merchant Payment to - Quickmart Ruaka", -206800],
	["2026-11-05 10:00:00", "Customer Transfer to - PETER KAMAU RENT", -2200000],
	["2026-11-05 10:00:01", "Customer Transfer of Funds Charge", -2900],
	["2026-11-08 15:31:40", "Funds received from - ZIIDI", 3100000],
	["2026-11-10 23:32:48", "M-Shwari Withdraw", 3100000],
	["2026-11-11 08:19:52", "Merchant Payment to - Nduta Grocery", -96500],
	["2026-11-13 12:44:06", "Customer Transfer to - CALVIN KAMARA 0141663900", -900000],
	["2026-11-13 12:44:07", "Customer Transfer of Funds Charge", -2900],
	["2026-11-15 22:38:28", "Funds received from - Divisible Inc in US via TerraPay", 6840000],
	["2026-11-16 19:21:57", "Merchant Payment to - Carrefour TRM", -2470000],
	["2026-11-16 15:29:59", "Pay Bill Online to KCA UNIVERSITY VIA Absa Acc. 25/06236", -6000000],
	["2026-11-16 15:29:59", "Pay Bill Charge", -100000],
	["2026-11-17 21:58:36", "Customer Bundle Purchase to Safaricom Offers - Tunukiwa", -100000],
	["2026-11-18 09:47:28", "Merchant Payment to - MARGARET NJERI", -400000],
	["2026-11-18 17:27:11", "Customer Transfer to - ALYA MEME", -500000],
	["2026-11-18 19:52:24", "Merchant Payment to - MARY MURAGE", -500000],
];

export function demoTransactions(): parser.Transaction[] {
	let balance = OPENING_BALANCE;
	return ROWS.map(([date, description, amount], i) => {
		balance += amount;
		return {
			id: `demo-${String(i + 1).padStart(3, "0")}`,
			date,
			description,
			status: "Completed",
			amount,
			balance,
		};
	});
}
