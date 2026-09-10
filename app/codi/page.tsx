import type { Metadata } from "next";
import CodiApp from "@/components/CodiApp";

export const metadata: Metadata = {
  title: "Codi",
  description: "Live mirror of the visible Codex thread on your Mac"
};

export default function CodiPage() {
  return <CodiApp />;
}
