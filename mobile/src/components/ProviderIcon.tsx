import { useState } from "react";
import { Image, Text, View } from "react-native";
import { initials, logoUrl, resolveProvider } from "../../../shared/providers";

// Logo del banco o la tarjeta (el mismo que en la web); si no carga, las iniciales sobre el color.
export function ProviderIcon({ name, color, size = 40, provider }: { name: string; color: string; size?: number; provider?: string | null }) {
  const domain = resolveProvider(provider, name)?.domain;
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  const showLogo = Boolean(domain) && state === "ok";
  const logo = Math.round(size * 0.72);
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.4), overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: showLogo ? "#ffffff" : color }}>
      {!showLogo ? <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: Math.round(size * 0.36) }}>{initials(name)}</Text> : null}
      {domain && state !== "failed" ? (
        <Image
          source={{ uri: logoUrl(domain) }}
          accessibilityIgnoresInvertColors
          onLoad={(event) => setState(event.nativeEvent.source.width <= 16 ? "failed" : "ok")}
          onError={() => setState("failed")}
          style={{ width: logo, height: logo, position: showLogo ? "relative" : "absolute", opacity: showLogo ? 1 : 0 }}
        />
      ) : null}
    </View>
  );
}
