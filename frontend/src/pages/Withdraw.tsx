import { Banknote, CreditCard, Landmark } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

/** Withdraw - agent / ATM / bank. The flow is not built yet; the page says
 * so plainly and the ledger keeps recording withdrawals made elsewhere. */
export default function Withdraw() {
  const options = [
    {
      icon: Banknote,
      title: "Agent",
      desc: "Withdraw cash at an M-Pesa agent.",
    },
    {
      icon: CreditCard,
      title: "ATM",
      desc: "Withdraw cash from an ATM.",
    },
    {
      icon: Landmark,
      title: "Bank",
      desc: "Move money between M-Pesa and your bank.",
    },
  ];
  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <PageHeader title="Withdraw" />
      <Card className="rounded-(--radius)">
        <CardContent className="space-y-1">
          {options.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="flex min-h-12 items-center gap-3 px-1 py-1.5"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted text-muted-foreground">
                <Icon className="size-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
          <p className="px-1 pb-1 pt-3 text-xs text-muted-foreground">
            Withdraw is still being built, and payments you make at an agent,
            ATM or your bank still land in the ledger.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
