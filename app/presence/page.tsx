import AuroraPresenceHost from "@/components/AuroraPresenceHost";
import { AuroraProvider } from "@/components/AuroraProvider";

export default function AuroraPresencePage() {
  return (
    <AuroraProvider>
      <AuroraPresenceHost />
    </AuroraProvider>
  );
}
