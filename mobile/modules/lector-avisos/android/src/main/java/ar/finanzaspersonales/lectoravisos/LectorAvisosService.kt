package ar.finanzaspersonales.lectoravisos

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
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
    if (Almacen.encolar(context, json)) EnviarWorker.programar(context)
  }

  private fun iso(millis: Long): String {
    val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    format.timeZone = TimeZone.getTimeZone("UTC")
    return format.format(Date(millis))
  }
}
