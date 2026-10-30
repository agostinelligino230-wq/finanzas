package ar.finanzaspersonales.lectoravisos

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.SystemClock
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

// Android le pasa a este servicio cada notificación que aparece en el teléfono (también con la app cerrada).
// Solo se quedan las de las apps de bancos y billeteras de la lista; todo lo demás se ignora sin guardarse.
class LectorAvisosService : NotificationListenerService() {
  override fun onListenerConnected() {
    Almacen.marcarEscuchando(applicationContext, true)
  }

  override fun onListenerDisconnected() {
    Almacen.marcarEscuchando(applicationContext, false)
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    val aviso = sbn ?: return
    val context = applicationContext
    if (!Almacen.activo(context) || !Almacen.paquetes(context).contains(aviso.packageName)) return
    val notification = aviso.notification ?: return
    // Resúmenes de grupo («3 avisos nuevos») y notificaciones fijas (descargas, servicios) no son movimientos.
    if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0 || aviso.isOngoing) return

    val extras = notification.extras
    val titulo = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val texto = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
    val largo = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
      ?: extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.joinToString("\n") { it.toString() }
      ?: ""
    if (titulo.isBlank() && texto.isBlank() && largo.isBlank()) return

    val json = JSONObject()
      .put("clave", aviso.key + "|" + aviso.postTime)
      .put("claveAndroid", aviso.key)
      .put("publicado", iso(aviso.postTime))
      .put("paquete", aviso.packageName)
      .put("titulo", titulo.take(300))
      .put("texto", texto.take(4000))
      .put("textoLargo", largo.take(4000))
    ubicacionReciente(context)?.let { json.put("lat", it.latitude).put("lng", it.longitude).put("precision", it.accuracy.toDouble()) }
    if (Almacen.encolar(context, json)) EnviarWorker.programar(context)
  }

  // Dónde estaba el teléfono cuando llegó el aviso: lo último que sabe Android, si tiene menos de 10 minutos.
  // No enciende el GPS ni usa permiso en segundo plano. Sin permiso o sin dato, el aviso se manda igual.
  @SuppressLint("MissingPermission")
  private fun ubicacionReciente(context: Context): Location? = try {
    val fina = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val aproximada = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    if (!Almacen.ubicacionActiva(context) || (!fina && !aproximada)) {
      null
    } else {
      val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      manager.getProviders(true)
        .mapNotNull { runCatching { manager.getLastKnownLocation(it) }.getOrNull() }
        .filter { SystemClock.elapsedRealtimeNanos() - it.elapsedRealtimeNanos < MAX_EDAD_UBICACION_NS }
        .minByOrNull { it.accuracy }
    }
  } catch (error: Exception) {
    null
  }

  private fun iso(millis: Long): String {
    val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    format.timeZone = TimeZone.getTimeZone("UTC")
    return format.format(Date(millis))
  }

  companion object {
    private const val MAX_EDAD_UBICACION_NS = 10 * 60 * 1_000_000_000L
  }
}
