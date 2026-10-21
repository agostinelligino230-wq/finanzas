package ar.finanzaspersonales.lectoravisos

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Lo que la parte de JavaScript puede pedirle al lector de notificaciones (solo Android).
class LectorAvisosModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("LectorAvisos")

    // ¿La persona le dio a la app el acceso a las notificaciones (Ajustes de Android)?
    Function("estadoPermiso") {
      NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }

    // Abre la pantalla de Android donde se da el acceso (directo a la app en Android 11 o más).
    Function("abrirAjustes") {
      val componente = ComponentName(context, LectorAvisosService::class.java)
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, componente.flattenToString())
      } else {
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
      }
      abrir(intent) || abrir(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }

    // Ficha de la app en Ajustes (ahí está Batería → «Sin restricciones»).
    Function("abrirAjustesApp") {
      abrir(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.packageName)))
    }

    Function("vincular") { token: String, url: String ->
      Almacen.vincular(context, token, url)
      Almacen.activar(context, true)
      NotificationListenerService.requestRebind(ComponentName(context, LectorAvisosService::class.java))
      EnviarWorker.programar(context)
    }

    Function("desvincular") {
      Almacen.activar(context, false)
      Almacen.desvincular(context)
    }

    Function("activar") { activo: Boolean -> Almacen.activar(context, activo) }

    Function("actualizarPaquetes") { paquetes: List<String>, version: Int -> Almacen.guardarPaquetes(context, paquetes, version) }

    Function("estado") {
      mapOf(
        "permiso" to NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName),
        "activo" to Almacen.activo(context),
        "vinculado" to Almacen.vinculado(context),
        "revocado" to Almacen.revocado(context),
        "escuchando" to Almacen.escuchando(context),
        "pendientes" to Almacen.pendientes(context),
        "paquetes" to Almacen.paquetes(context).size,
        "versionPaquetes" to Almacen.versionPaquetes(context),
      )
    }

    Function("enviarAhora") { EnviarWorker.programar(context) }
  }

  private fun abrir(intent: Intent): Boolean = try {
    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    true
  } catch (error: Exception) {
    false
  }
}
