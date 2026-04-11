import { CacheQuantidadeMargemMonitor } from "@/components/CacheQuantidadeMargemMonitor";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Monitoramento — cache Quantidade × Margem | PMG",
};

export default function AdminCacheQuantidadeMargemPage() {
  return (
    <>
      <h1 style={{ marginBottom: "0.5rem", fontSize: "1.5rem", fontWeight: 700 }}>
        Cache — Quantidade × Margem
      </h1>
      <CacheQuantidadeMargemMonitor />
    </>
  );
}
