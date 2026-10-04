package expo.modules.attendancenotification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val CHANNEL_ID = "attendance"
private const val NOTIFICATION_ID = 7421
private const val EXTRA_PUNCH_IN = "punchInMillis"

/**
 * The "Attendance Active" notification, backed by a real foreground
 * service so it survives independently of the JS process, with
 * CATEGORY_STOPWATCH + setOngoing + the built-in chronometer - the
 * combination Samsung's (and stock Android's) compact "Live
 * notification" pill renderer looks for, drawn by the system itself
 * from standard notification fields.
 *
 * On a device/skin that honours that signal, swiping it away is a
 * platform-level choice some OEMs allow regardless of ongoing status
 * - reopening the app while still punched in re-syncs the open
 * shift and starts this service again, which is the expected
 * recovery rather than something this service fights to prevent.
 *
 * The chronometer does all the ticking itself - this service only
 * posts the notification once, on start, and tears it down on stop.
 * There is no loop here, nothing polls, nothing reposts.
 */
class AttendanceForegroundService : Service() {
  companion object {
    fun start(context: Context, punchInMillis: Long) {
      val intent = Intent(context, AttendanceForegroundService::class.java)
        .putExtra(EXTRA_PUNCH_IN, punchInMillis)
      ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, AttendanceForegroundService::class.java))
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val punchInMillis = intent?.getLongExtra(EXTRA_PUNCH_IN, -1L) ?: -1L

    if (punchInMillis <= 0) {
      stopSelf()
      return START_NOT_STICKY
    }

    ensureChannel()
    val notification = buildNotification(punchInMillis)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    /**
     * Not a worker to restart with a remembered punch-in time: if
     * Android kills the process, the attendance screen re-syncs
     * the open shift from the server on next launch and starts this
     * service again then, rather than this service guessing at a
     * stale extra.
     */
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    super.onDestroy()
    stopForeground(STOP_FOREGROUND_REMOVE)
  }

  /**
   * No custom view here on purpose. Samsung's (and stock Android's)
   * compact "Live notification" pill is drawn by the SYSTEM from a
   * notification's standard fields - it specifically looks for an
   * ongoing notification carrying CATEGORY_STOPWATCH (the same
   * category a timer/stopwatch app would use) plus the built-in
   * chronometer. A custom RemoteViews view is opaque to that
   * renderer, which is exactly why the custom-layout version never
   * got the pill treatment, only a regular (bigger) notification
   * card.
   */
  private fun buildNotification(punchInMillis: Long): Notification {
    val timeFormat = SimpleDateFormat("hh:mm a", Locale.getDefault())
    val punchInText = "Punched in " + timeFormat.format(Date(punchInMillis))

    val openApp = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = openApp?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Attendance Active")
      .setContentText(punchInText)
      .setContentIntent(contentIntent)
      /** the chronometer counts up from this instant - the server's punch-in time, not a local timer */
      .setWhen(punchInMillis)
      .setShowWhen(true)
      .setUsesChronometer(true)
      /** the signal the system's Live Update / Live Notification renderer looks for */
      .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
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
