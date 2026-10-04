package expo.modules.attendancenotification

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * ============================================================
 * ATTENDANCE NOTIFICATION
 * ============================================================
 *
 * The JS-facing surface. The actual notification lives in
 * AttendanceForegroundService - this just starts/stops it.
 */
class AttendanceNotificationModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AttendanceNotification")

    Function("start") { punchInMillis: Double ->
      AttendanceForegroundService.start(context, punchInMillis.toLong())
    }

    Function("stop") {
      AttendanceForegroundService.stop(context)
    }
  }
}
