import { useState } from "react";
import { ActivityIndicator, Switch, View } from "react-native";
import { router } from "expo-router";
import { money, monthLabel, usd } from "../../../shared/format";
import { resolveProvider } from "../../../shared/providers";
import { isPending, needsPassword, type AnalyzeOptions, type StatementSource } from "../../../shared/resumenes";
import { useStatementSources } from "../lib/statements";
import { radius, useColors } from "../lib/theme";
import { Icon } from "./Icon";
import { ProviderIcon } from "./ProviderIcon";
import { Button, Card, ErrorBox, Field, T, styles } from "./ui";

const shortDate = (value: string) => new Date(value.length === 10 ? value + "T12:00:00" : value).toLocaleDateString("es-AR", { day: "numeric", month: "long" });

const FAILS: Record<string, string> = {
  "no-se-pudo-leer": "No pudimos leer este resumen. Puede que tu banco use un formato distinto: avisanos y lo sumamos.",
  "sin-pdf": "Ese mail ya no tiene el PDF del resumen.",
  permiso: "Google ya no nos deja leer tu Gmail. Volvé a conectarlo.",
};

// "¿Querés que analicemos tu último resumen?" para cada tarjeta encontrada en el Gmail; en Inicio (onlyPending) solo las pendientes.
export function StatementSources({ userId, onlyPending = false }: { userId: string; onlyPending?: boolean }) {
  const colors = useColors();
  const data = useStatementSources(userId);
  // Las que se analizan ahora siguen a la vista (para ver el resultado) aunque ya no estén pendientes.
  const [done, setDone] = useState<string[]>([]);
  const [all, setAll] = useState(false);
  const visible = onlyPending ? data.sources.filter((source) => isPending(source) || (done.includes(source.id) && !source.dismissed)) : data.sources;
  const pending = data.sources.filter((source) => isPending(source) && !needsPassword(source));
  const analyze = (source: StatementSource, options: AnalyzeOptions) => {
    setDone((list) => (list.includes(source.id) ? list : [...list, source.id]));
    return data.analyze(source, options);
  };

  if (onlyPending && visible.length === 0) return null;

  const analyzeAll = async () => {
    setAll(true);
    for (const source of pending) await analyze(source, { auto: true });
    setAll(false);
  };
  const scanning = data.busy === "buscar";

  return (
    <Card style={{ gap: 12 }}>
      <View style={[styles.row, { alignItems: "flex-start" }]}>
        <View style={{ width: 40, height: 40, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft }}><Icon name="Sparkles" size={20} color={colors.primaryText} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T style={{ fontWeight: "600" }}>{onlyPending ? (visible.length === 1 ? "Encontramos el resumen de tu tarjeta en tu Gmail" : "Encontramos los resúmenes de tus tarjetas en tu Gmail") : "Resúmenes de tus tarjetas"}</T>
          <T variant="small" style={{ fontSize: 13 }}>Si nos dejás, leemos el PDF del resumen y cargamos solo lo que gastaste, cuándo vence, cuánto tenés que pagar y las cuotas que te quedan.</T>
        </View>
      </View>
      <ErrorBox message={data.error} />

      {pending.length > 1 ? (
        <Button label={all ? "Analizando…" : "Sí, analizar las " + pending.length + " tarjetas"} icon="Sparkles" onPress={analyzeAll} busy={all} disabled={!all && data.busy !== null} />
      ) : null}

      {data.loaded && !onlyPending && visible.length === 0 ? (
        <View style={{ gap: 4, padding: 12, borderRadius: radius.field, backgroundColor: colors.surface2 }}>
          <T style={{ fontSize: 14 }}>No encontramos resúmenes de tarjeta en PDF en tu Gmail de los últimos dos meses.</T>
          <Button label={scanning ? "Buscando…" : "Buscar de nuevo"} icon="Search" variant="ghost" onPress={data.scan} busy={scanning} disabled={!scanning && data.busy !== null} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }} />
        </View>
      ) : null}

      {visible.map((source) => (
        <SourceRow key={source.id} source={source} busy={data.busy === source.id || (all && isPending(source))} disabled={data.busy !== null || all}
          onAnalyze={(options) => analyze(source, options)} onAuto={(auto) => data.setAuto(source, auto)} onDismiss={(dismissed) => data.dismiss(source, dismissed)} />
      ))}

      {!onlyPending && visible.length > 0 ? (
        <Button label={scanning ? "Buscando…" : "Buscar otras tarjetas"} icon="RefreshCw" variant="ghost" onPress={data.scan} busy={scanning} disabled={!scanning && data.busy !== null} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }} />
      ) : null}
    </Card>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (value: boolean) => void; label: string }) {
  const colors = useColors();
  return (
    <View style={[styles.row, { minHeight: 44 }]}>
      <T variant="small" style={{ flex: 1, fontSize: 13 }}>{label}</T>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: colors.primary, false: colors.border }} />
    </View>
  );
}

function SourceRow({ source, busy, disabled, onAnalyze, onAuto, onDismiss }: {
  source: StatementSource; busy: boolean; disabled: boolean;
  onAnalyze: (options: AnalyzeOptions) => Promise<unknown>; onAuto: (auto: boolean) => void; onDismiss: (dismissed: boolean) => void;
}) {
  const colors = useColors();
  const [auto, setAuto] = useState(true);
  const [clave, setClave] = useState("");
  const [recordar, setRecordar] = useState(true);
  const color = resolveProvider(source.provider, source.label)?.color ?? "#5B6CF0";
  const pending = isPending(source);
  const result = source.result;
  const fail = FAILS[source.status];
  const open = () => { if (clave.trim()) onAnalyze({ clave, recordar, auto: true }); };
  const dates = result ? [result.vence && "Vence el " + shortDate(result.vence), result.minimo && "pago mínimo " + money(result.minimo)].filter(Boolean).join(" · ") : "";

  return (
    <View style={{ gap: 12, padding: 12, borderRadius: radius.field, borderWidth: 1, borderColor: colors.border }}>
      <View style={styles.row}>
        <ProviderIcon name={source.label} color={color} provider={source.provider} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T numberOfLines={1} style={{ fontWeight: "600" }}>{source.label}</T>
          <T variant="small" numberOfLines={1}>{source.last_mail_at ? "Último resumen: llegó el " + shortDate(source.last_mail_at) : "Resumen por mail"}</T>
        </View>
        {busy ? <ActivityIndicator color={colors.primaryText} /> : null}
      </View>

      {busy ? (
        <T variant="small" style={{ fontSize: 14 }}>Leyendo el PDF del resumen…</T>
      ) : needsPassword(source) ? (
        <View style={{ gap: 8 }}>
          <View style={[styles.row, { alignItems: "flex-start", gap: 8 }]}>
            <Icon name="KeyRound" size={16} color={colors.primaryText} />
            <T style={{ flex: 1, fontSize: 14 }}>{source.status === "clave-incorrecta" ? "Esa clave no abrió el PDF. Probá de nuevo." : "Tu banco protege el resumen con una clave. Casi siempre es tu número de documento, sin puntos."}</T>
          </View>
          <View style={[styles.row, { gap: 8 }]}>
            <View style={{ flex: 1 }}>
              <Field value={clave} onChangeText={setClave} secureTextEntry autoCapitalize="none" autoComplete="off" autoCorrect={false} importantForAutofill="no" placeholder="Clave del PDF" accessibilityLabel={"Clave del PDF de " + source.label} returnKeyType="go" onSubmitEditing={open} />
            </View>
            <Button label="Abrir" onPress={open} disabled={disabled || !clave.trim()} />
          </View>
          <Toggle value={recordar} onChange={setRecordar} label="Recordarla para leer solos los próximos resúmenes" />
        </View>
      ) : pending && !source.auto ? (
        <View style={{ gap: 8 }}>
          <T style={{ fontSize: 14 }}>{fail ?? (source.analyzed_message_id ? "Llegó un resumen nuevo. ¿Querés que lo analicemos?" : "¿Querés que analicemos tu último resumen?")}</T>
          <View style={[styles.row, { gap: 8 }]}>
            <Button label={fail ? "Probar de nuevo" : "Sí, analizar"} onPress={() => onAnalyze({ auto })} disabled={disabled} style={{ flex: 1 }} />
            <Button label="Ahora no" variant="secondary" onPress={() => onDismiss(true)} disabled={disabled} />
          </View>
          <Toggle value={auto} onChange={setAuto} label="Analizar solos los próximos resúmenes de esta tarjeta" />
        </View>
      ) : pending && source.auto ? (
        <View style={[styles.row, { gap: 8 }]}>
          <T variant="small" style={{ flex: 1, fontSize: 14 }}>{fail ?? "Llegó un resumen nuevo: se analiza solo en la próxima lectura."}</T>
          <Button label="Analizar ya" variant="ghost" onPress={() => onAnalyze({})} disabled={disabled} style={{ paddingHorizontal: 8 }} />
        </View>
      ) : source.dismissed ? (
        <View style={[styles.row, { gap: 8 }]}>
          <T variant="small" style={{ flex: 1, fontSize: 14 }}>No se analiza.</T>
          <Button label="Analizar" variant="ghost" onPress={() => { onDismiss(false); onAnalyze({ auto: true }); }} disabled={disabled} style={{ paddingHorizontal: 8 }} />
        </View>
      ) : null}

      {!busy && result && !needsPassword(source) ? (
        <View style={{ gap: 4, padding: 12, borderRadius: radius.field, backgroundColor: colors.surface2 }}>
          <View style={[styles.row, { alignItems: "flex-start", gap: 8 }]}>
            <Icon name="FileText" size={16} color={colors.primaryText} />
            <T style={{ flex: 1, fontSize: 14, fontWeight: "600" }}>Resumen de {monthLabel(result.mes).toLowerCase()}: {money(result.total)}{result.total_usd > 0 ? " + " + usd(result.total_usd) : ""}</T>
          </View>
          {dates ? <T variant="small" style={{ fontSize: 14 }}>{dates}</T> : null}
          <T variant="small" style={{ fontSize: 14 }}>{result.consumos} {result.consumos === 1 ? "consumo" : "consumos"}{result.cuotas > 0 ? " · " + result.cuotas + (result.cuotas === 1 ? " compra en cuotas" : " compras en cuotas") : ""}{result.cargos > 0 ? " · " + money(result.cargos) + " de impuestos y cargos" : ""}</T>
          {result.pendiente > 0 ? <T style={{ fontSize: 14, fontWeight: "500" }}>Te quedan {money(result.pendiente)} en cuotas por pagar{result.hasta ? " (hasta " + monthLabel(result.hasta).toLowerCase() + ")" : ""}.</T> : null}
          <Button label="Ver el detalle en Tarjetas" variant="ghost" onPress={() => router.push("/fijos")} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }} />
        </View>
      ) : null}

      {!busy && !pending && !source.dismissed && result ? (
        <Toggle value={source.auto} onChange={onAuto} label={"Analizar solos los próximos resúmenes" + (source.password_saved ? " (la clave del PDF quedó guardada)" : "")} />
      ) : null}
    </View>
  );
}
