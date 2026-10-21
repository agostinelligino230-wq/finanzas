import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { useColors } from "../lib/theme";
import { Icon } from "../components/Icon";
import { Button, Card, ErrorBox, Field, Notice, Screen, T } from "../components/ui";

type Mode = "login" | "register" | "forgot";

export default function Login() {
  const auth = useAuth();
  const colors = useColors();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const params = useLocalSearchParams<{ error?: string }>();
  const [error, setError] = useState(params.error ?? "");
  const [message, setMessage] = useState("");

  const go = (next: Mode) => { setMode(next); setError(""); setMessage(""); };

  const submit = async () => {
    if (!email.trim()) { setError("Escribí tu email."); return; }
    if (mode !== "forgot" && password.length < 6) { setError("La contraseña tiene que tener al menos 6 caracteres."); return; }
    setBusy(true); setError(""); setMessage("");
    if (mode === "login") {
      const problem = await auth.signIn(email, password);
      if (problem) setError(problem);
    } else if (mode === "register") {
      const result = await auth.signUp(email, password);
      if (result.error) setError(result.error);
      else if (result.needsConfirmation) setMessage("Te mandamos un mail para confirmar tu cuenta. Abrilo, confirmá y después ingresá acá.");
    } else {
      const problem = await auth.resetPassword(email);
      if (problem) setError(problem);
      else setMessage("Te mandamos un mail con un link para elegir una contraseña nueva. Después ingresá acá con esa contraseña.");
    }
    setBusy(false);
  };

  const google = async () => {
    setBusy(true); setError("");
    const problem = await auth.signInWithGoogle();
    if (problem) setError(problem);
    setBusy(false);
  };

  const titles: Record<Mode, string> = { login: "Ingresá", register: "Creá tu cuenta", forgot: "Recuperá tu contraseña" };

  if (auth.session) return <Redirect href="/" />;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen edges={["top", "bottom"]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 24, marginBottom: 8 }}>
          <Image source={require("../../assets/icon.png")} style={{ width: 48, height: 48, borderRadius: 12 }} accessibilityIgnoresInvertColors />
          <View>
            <T variant="subtitle">Finanzas Personales</T>
            <T variant="small">tu mes, más claro</T>
          </View>
        </View>
        {!supabase ? <ErrorBox message="Falta configurar Supabase (mobile/.env)." /> : null}
        <Card style={{ gap: 14 }}>
          <T variant="title">{titles[mode]}</T>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" autoCorrect={false} />
          {mode !== "forgot" ? (
            <View style={{ gap: 6 }}>
              <T variant="label">Contraseña</T>
              <View style={{ justifyContent: "center" }}>
                <Field value={password} onChangeText={setPassword} secureTextEntry={!visible} autoCapitalize="none" autoComplete={mode === "login" ? "current-password" : "new-password"} textContentType={mode === "login" ? "password" : "newPassword"} style={{ paddingRight: 52 }} />
                <Pressable accessibilityRole="button" accessibilityLabel={visible ? "Ocultar contraseña" : "Mostrar contraseña"} onPress={() => setVisible(!visible)} hitSlop={8} style={{ position: "absolute", right: 4, width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={visible ? "EyeOff" : "Eye"} size={18} color={colors.muted} />
                </Pressable>
              </View>
            </View>
          ) : null}
          <ErrorBox message={error} />
          <Notice message={message} />
          <Button label={mode === "login" ? "Ingresar" : mode === "register" ? "Crear cuenta" : "Mandarme el link"} onPress={submit} busy={busy} />
          {mode !== "forgot" ? <Button label="Ingresar con Google" variant="secondary" onPress={google} disabled={busy} /> : null}
          <View style={{ gap: 4 }}>
            {mode === "login" ? <Button label="Olvidé mi contraseña" variant="ghost" onPress={() => go("forgot")} /> : null}
            {mode === "login" ? <Button label="No tengo cuenta: crear una" variant="ghost" onPress={() => go("register")} /> : <Button label="Ya tengo cuenta: ingresar" variant="ghost" onPress={() => go("login")} />}
          </View>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
