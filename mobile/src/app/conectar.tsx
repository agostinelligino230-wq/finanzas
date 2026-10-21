import { Redirect, useLocalSearchParams } from "expo-router";

// Vuelta de Google al conectar Gmail (finanzas://conectar?gmail=ok): se muestra el resultado en Cuentas.
export default function ConnectReturn() {
  const { gmail } = useLocalSearchParams<{ gmail?: string }>();
  return <Redirect href={{ pathname: "/cuentas", params: gmail ? { gmail } : {} }} />;
}
