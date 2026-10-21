package ar.finanzaspersonales.lectoravisos

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

// Manda la cola al servidor apenas hay conexión. Si falla, WorkManager reintenta con espera creciente
// (también después de reiniciar el teléfono). Lo que el servidor ya recibió se saca de la cola.
class EnviarWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    val context = applicationContext
    val token = Almacen.token(context) ?: return@withContext Result.success()
    val url = Almacen.url(context) ?: return@withContext Result.success()
    repeat(20) {
      val lote = Almacen.primeros(context, LOTE)
      if (lote.isEmpty()) return@withContext Result.success()
      val body = JSONObject().put("avisos", JSONArray(lote)).put("escuchando", Almacen.escuchando(context))
      val status = try { enviar(url, token, body.toString()) } catch (error: Exception) { return@withContext Result.retry() }
      when {
        status in 200..299 || status == 413 -> Almacen.sacar(context, lote.map { it.optString("clave") }.toSet())
        status == 401 -> { Almacen.marcarRevocado(context); return@withContext Result.success() }
        else -> return@withContext Result.retry()
      }
    }
    Result.success()
  }

  private fun enviar(url: String, token: String, body: String): Int {
    val conexion = URL(url).openConnection() as HttpURLConnection
    return try {
      conexion.requestMethod = "POST"
      conexion.connectTimeout = 15000
      conexion.readTimeout = 30000
      conexion.doOutput = true
      conexion.setRequestProperty("Content-Type", "application/json")
      conexion.setRequestProperty("X-Device-Token", token)
      conexion.outputStream.use { it.write(body.toByteArray()) }
      conexion.responseCode
    } finally {
      conexion.disconnect()
    }
  }

  companion object {
    private const val LOTE = 50
    private const val NOMBRE = "lector-avisos-enviar"

    fun programar(context: Context) {
      val pedido = OneTimeWorkRequestBuilder<EnviarWorker>()
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
        .build()
      // APPEND_OR_REPLACE: si ya hay un envío en curso, este corre después (no se pierde ningún aviso).
      WorkManager.getInstance(context).enqueueUniqueWork(NOMBRE, ExistingWorkPolicy.APPEND_OR_REPLACE, pedido)
    }
  }
}
