package ar.finanzaspersonales.lectoravisos

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

// Lo que el lector necesita aunque la app esté cerrada: a dónde mandar, con qué token (cifrado con una clave
// del Android Keystore, que no sale del teléfono), qué apps dejar pasar y la cola de avisos por mandar.
object Almacen {
  private const val PREFS = "lector_avisos"
  private const val KEY_ALIAS = "lector_avisos_token"
  private const val COLA = "lector-avisos-cola.json"
  private const val MAX_COLA = 500
  private const val VENTANA_REPETIDOS_MS = 24 * 60 * 60 * 1000L

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  // ---------- Vínculo con el servidor ----------

  fun vincular(context: Context, token: String, url: String) {
    prefs(context).edit().putString("token", cifrar(token)).putString("url", url).putBoolean("revocado", false).apply()
  }

  fun desvincular(context: Context) {
    prefs(context).edit().remove("token").remove("url").putBoolean("revocado", false).apply()
  }

  fun token(context: Context): String? = prefs(context).getString("token", null)?.let { runCatching { descifrar(it) }.getOrNull() }
  fun url(context: Context): String? = prefs(context).getString("url", null)
  fun vinculado(context: Context) = token(context) != null && url(context) != null

  // El servidor respondió 401: el celular fue revocado; la app pide volver a vincular.
  fun marcarRevocado(context: Context) = prefs(context).edit().putBoolean("revocado", true).apply()
  fun revocado(context: Context) = prefs(context).getBoolean("revocado", false)

  // ---------- Apps permitidas ----------

  fun guardarPaquetes(context: Context, paquetes: List<String>, version: Int) {
    prefs(context).edit().putStringSet("paquetes", paquetes.toSet()).putInt("version", version).apply()
  }

  fun paquetes(context: Context): Set<String> = prefs(context).getStringSet("paquetes", emptySet()) ?: emptySet()
  fun versionPaquetes(context: Context) = prefs(context).getInt("version", 0)

  fun activar(context: Context, activo: Boolean) = prefs(context).edit().putBoolean("activo", activo).apply()
  fun activo(context: Context) = prefs(context).getBoolean("activo", false)

  fun marcarEscuchando(context: Context, escuchando: Boolean) = prefs(context).edit().putBoolean("escuchando", escuchando).apply()
  fun escuchando(context: Context) = prefs(context).getBoolean("escuchando", false)

  // ---------- Cola en disco ----------

  @Synchronized
  fun encolar(context: Context, aviso: JSONObject): Boolean {
    // Android vuelve a publicar una notificación cuando se actualiza: si es la misma (misma clave y mismo texto), no se manda otra vez.
    val firma = hash(aviso.optString("claveAndroid") + "|" + aviso.optString("titulo") + "|" + aviso.optString("texto") + "|" + aviso.optString("textoLargo"))
    val vistos = leerVistos(context)
    val ahora = System.currentTimeMillis()
    if (vistos.has(firma) && ahora - vistos.getLong(firma) < VENTANA_REPETIDOS_MS) return false
    vistos.put(firma, ahora)
    guardarVistos(context, vistos, ahora)
    val cola = leerCola(context)
    cola.put(aviso)
    while (cola.length() > MAX_COLA) cola.remove(0)
    escribir(context, COLA, cola.toString())
    return true
  }

  @Synchronized
  fun primeros(context: Context, cantidad: Int): List<JSONObject> {
    val cola = leerCola(context)
    return (0 until minOf(cantidad, cola.length())).map { cola.getJSONObject(it) }
  }

  @Synchronized
  fun sacar(context: Context, claves: Set<String>) {
    val cola = leerCola(context)
    val queda = JSONArray()
    for (i in 0 until cola.length()) {
      val item = cola.getJSONObject(i)
      if (!claves.contains(item.optString("clave"))) queda.put(item)
    }
    escribir(context, COLA, queda.toString())
  }

  @Synchronized
  fun pendientes(context: Context) = leerCola(context).length()

  private fun leerCola(context: Context) = runCatching { JSONArray(leer(context, COLA) ?: "[]") }.getOrDefault(JSONArray())

  private fun leerVistos(context: Context) = runCatching { JSONObject(prefs(context).getString("vistos", "{}") ?: "{}") }.getOrDefault(JSONObject())

  private fun guardarVistos(context: Context, vistos: JSONObject, ahora: Long) {
    val limpio = JSONObject()
    vistos.keys().forEach { clave -> val cuando = vistos.getLong(clave); if (ahora - cuando < VENTANA_REPETIDOS_MS) limpio.put(clave, cuando) }
    prefs(context).edit().putString("vistos", limpio.toString()).apply()
  }

  private fun leer(context: Context, nombre: String): String? = File(context.filesDir, nombre).takeIf { it.exists() }?.readText()

  private fun escribir(context: Context, nombre: String, texto: String) {
    val tmp = File(context.filesDir, "$nombre.tmp")
    tmp.writeText(texto)
    tmp.renameTo(File(context.filesDir, nombre))
  }

  private fun hash(texto: String) = MessageDigest.getInstance("SHA-256").digest(texto.toByteArray()).joinToString("") { "%02x".format(it) }

  // ---------- Cifrado del token (AES-GCM con una clave del Keystore) ----------

  private fun clave(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val generador = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generador.init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    return generador.generateKey()
  }

  private fun cifrar(texto: String): String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, clave())
    val datos = cipher.doFinal(texto.toByteArray())
    return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(datos, Base64.NO_WRAP)
  }

  private fun descifrar(guardado: String): String {
    val (iv, datos) = guardado.split(":")
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, clave(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
    return String(cipher.doFinal(Base64.decode(datos, Base64.NO_WRAP)))
  }
}
