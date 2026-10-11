import { MotionProvider } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/site-header";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <MotionProvider>
      <div className="flex grow flex-col">{children}</div>
      <SiteFooter />
    </MotionProvider>
  );
}
