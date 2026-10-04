package expo.modules.attendancenotification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * ============================================================
 * ATTENDANCE NOTIFICATION
 * ============================================================
 *
 * A single ongoing notification for the open shift, using
 * Android's own chronometer (setUsesChronometer + setWhen)
 * instead of rewriting the notification on a timer. Once
 * posted, the system itself ticks the displayed duration -
 * nothing on the JS side (or in this module) runs again until
 * punch-out calls stop(), so there is exactly one post, no
 * repeat alert, and no battery cost from polling.
 *
 * expo-notifications has no chronometer option, which is the
 * one piece of native code this app needs outside it.
 */
private const val CHANNEL_ID = "attendance"
private const val NOTIFICATION_ID = 7421

class AttendanceNotificationModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AttendanceNotification")

    Function("start") { punchInMillis: Double ->
      postNotification(punchInMillis.toLong())
    }

    Function("stop") {
      cancelNotification()
    }
  }

  private fun postNotification(punchInMillis: Long) {
    ensureChannel()

    val timeFormat = SimpleDateFormat("hh:mm a", Locale.getDefault())
    val punchInText = "Punched in " + timeFormat.format(Date(punchInMillis))

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("Attendance Active")
      .setContentText(punchInText)
      /** the chronometer counts up from this instant - the server's punch-in time, not a local timer */
      .setWhen(punchInMillis)
      .setShowWhen(true)
      .setUsesChronometer(true)
      /** pinned; a shade swipe cannot dismiss it while the shift is open */
      .setOngoing(true)
      /** only the first post may alert - later updates (there are none here) must stay silent */
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .build()

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(NOTIFICATION_ID, notification)
  }

  private fun cancelNotification() {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.cancel(NOTIFICATION_ID)
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      "Attendance",
      NotificationManager.IMPORTANCE_LOW
    )
    channel.description = "The ongoing working-time notification while you are punched in"
    channel.setSound(null, null)
    channel.enableVibration(false)
    channel.setShowBadge(false)

    manager.createNotificationChannel(channel)
  }
}
