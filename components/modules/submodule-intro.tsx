import { Card } from "@/components/ui/card";

type SubmoduleIntroProps = {
  moduleLabel: string;
  title: string;
  description: string;
};

export function SubmoduleIntro({ moduleLabel, title, description }: SubmoduleIntroProps) {
  return (
    <Card className="mb-4 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{moduleLabel}</p>
      <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-ink md:text-2xl">{title}</h1>
      <p className="mt-1.5 max-w-3xl text-xs text-slate-500 md:text-sm">{description}</p>
    </Card>
  );
}
