import AuroraVisionKernel from "@/components/AuroraVisionKernel";
import { AuroraKernelOnlyProvider } from "@/components/AuroraContext";

export default function AuroraVisionHostPage() {
  return (
    <AuroraKernelOnlyProvider>
      <main className="aurora-app" style={{ minHeight: "100vh", padding: "24px" }}>
        <section
          className="presence-zone"
          aria-label="Aurora direct vision host"
          style={{ width: "min(720px, 100%)", margin: "0 auto" }}
        >
          <header style={{ marginBottom: "18px" }}>
            <p className="vision-kernel__eyebrow">Direct Vision Host</p>
            <h1 style={{ margin: "0 0 8px" }}>Aurora Camera Link</h1>
            <p style={{ margin: 0, opacity: 0.78 }}>
              Keep this page open to provide Aurora with continuous live camera grounding from the same app,
              without waiting on the avatar renderer.
            </p>
          </header>

          <AuroraVisionKernel ingressLabel="vision_host" />
        </section>
      </main>
    </AuroraKernelOnlyProvider>
  );
}
