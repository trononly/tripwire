import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Lightbulb,
  Settings as SettingsIcon,
  Plus,
  Send as SendIcon,
  ShoppingCart,
  Landmark,
  Banknote,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { vibrateIfEnabled } from "@/lib/motion-settings";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

// Bottom nav destinations. Pay is not a route: the center button opens
// the Pay bottom sheet. The other four are real tabs.
const items = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight, end: false },
  null,
  { to: "/insights", label: "Insights", icon: Lightbulb, end: false },
  { to: "/settings", label: "Settings", icon: SettingsIcon, end: false },
] as const;

// Pay menu destinations: one row each with a route, a name and a
// one-line description. The sheet renders straight from this registry.
const actions = [
  {
    to: "/send",
    label: "Send money",
    description: "To a person or Pochi la Biashara",
    icon: SendIcon,
  },
  {
    to: "/lipa?tab=paybill",
    label: "Pay bill",
    description: "Paybill number with an account",
    icon: Landmark,
  },
  {
    to: "/lipa?tab=till",
    label: "Buy goods",
    description: "Till number at a shop or restaurant",
    icon: ShoppingCart,
  },
  {
    to: "/withdraw",
    label: "Withdraw",
    description: "Agent, ATM or to your bank",
    icon: Banknote,
  },
] as const;

export function MobileNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  // Close the sheet on any route change: system back, a destination tap,
  // or a navbar tap while the Pay menu is open.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Pay</DrawerTitle>
            <DrawerDescription>M-Pesa and bank destinations</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-1 px-2 pb-3">
            {actions.map(({ to, label, description, icon: Icon }) => (
              <button
                key={to}
                onClick={() => {
                  vibrateIfEnabled(10);
                  setOpen(false);
                  navigate(to);
                }}
                className="flex min-h-11 items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-muted"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted">
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground">
                    {description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Solid background, not translucent: the safe-area padding below the
          last row must paint the same colour as the bar itself, otherwise the
          gesture handle sits on a lighter strip. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-[70] border-t bg-background lg:hidden"
        style={{ paddingBottom: "var(--safe-bottom,env(safe-area-inset-bottom))" }}
      >
        <div className="grid grid-cols-5">
          {items.map((item) =>
            item === null ? (
              <button
                key="pay"
                aria-label="Pay"
                aria-expanded={open}
                onClick={() => {
                  vibrateIfEnabled(10);
                  setOpen((v) => !v);
                }}
                className="flex min-h-14 items-center justify-center px-2"
              >
                <span className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-pay-bg px-4 text-sm font-semibold text-pay-ink">
                  <Plus className="size-4" strokeWidth={2} />
                  Pay
                </span>
              </button>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => {
                  vibrateIfEnabled(10);
                  setOpen(false);
                }}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground",
                    isActive && "text-primary",
                  )
                }
              >
                <item.icon className="size-5" strokeWidth={1.75} />
                {item.label}
              </NavLink>
            ),
          )}
        </div>
      </nav>
    </>
  );
}
