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
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val CHANNEL_ID = "attendance"
private const val NOTIFICATION_ID = 7421
private const val EXTRA_PUNCH_IN = "punchInMillis"

/**
 * Keeps the "Attendance Active" notification alive and genuinely
 * non-swipeable by backing it with a real foreground service - a
 * plain NotificationManager.notify(), even with setOngoing(true),
 * can still be dismissed by a swipe on many Android versions/OEMs.
 * A foreground service's notification is what the OS actually
 * treats as non-dismissable, and stopWithTask="false" (manifest)
 * keeps it running even if the task is swiped from recents.
 *
 * The body is a custom RemoteViews layout (160dp, title + punch-in
 * time on the left, a live Chronometer on the right) inside
 * DecoratedCustomViewStyle, which keeps Android's own header (app
 * icon, app name, the small relative-time badge) and only replaces
 * the content area below it.
 *
 * The chronometer still does all the ticking itself - this service
 * only posts the notification once, on start, and tears it down on
 * stop. There is no loop here, nothing polls, nothing reposts.
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

  private fun buildNotification(punchInMillis: Long): Notification {
    val timeFormat = SimpleDateFormat("hh:mm a", Locale.getDefault())
    val punchInText = "Punched in " + timeFormat.format(Date(punchInMillis))

    /**
     * Chronometer runs on SystemClock.elapsedRealtime() (time since
     * boot), not wall-clock time - converting the real punch-in
     * instant into that time base is what lets the displayed timer
     * already show the correct elapsed duration the moment this
     * service (re)starts, rather than restarting from zero.
     */
    val bootTimeMillis = System.currentTimeMillis() - SystemClock.elapsedRealtime()
    val chronometerBase = punchInMillis - bootTimeMillis

    /**
     * Two separate RemoteViews instances from the same layout - one
     * for the collapsed state, one for expanded. Only setting the
     * collapsed one left the expanded state to Android's own
     * fallback, which is why it looked small/default until dragged
     * open. Setting both makes the two states identical, so it
     * always shows at the full fixed size.
     */
    fun inflate() = RemoteViews(packageName, R.layout.notification_attendance).apply {
      setTextViewText(R.id.text_punch_in, punchInText)
      setChronometer(R.id.live_timer, chronometerBase, null, true)
    }

    val openApp = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = openApp?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomContentView(inflate())
      .setCustomBigContentView(inflate())
      .setContentIntent(contentIntent)
      /** the small relative-time badge next to the app name in the system header */
      .setWhen(punchInMillis)
      .setShowWhen(true)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
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
