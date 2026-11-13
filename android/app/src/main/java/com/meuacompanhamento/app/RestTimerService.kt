package com.meuacompanhamento.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.media.AudioAttributes
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

class RestTimerService : Service() {
    companion object {
        const val PREFS = "rest_timer_state"
        const val ACTION_START = "com.meuacompanhamento.app.rest.START"
        const val ACTION_PAUSE = "com.meuacompanhamento.app.rest.PAUSE"
        const val ACTION_RESUME = "com.meuacompanhamento.app.rest.RESUME"
        const val ACTION_STOP = "com.meuacompanhamento.app.rest.STOP"
        const val EXTRA_SECONDS = "seconds"
        private const val CHANNEL_ID = "workout_rest_timer"
        private const val DONE_CHANNEL_ID = "workout_rest_done"
        private const val NOTIFICATION_ID = 7201
    }

    private val handler = Handler(Looper.getMainLooper())
    private var endAt = 0L
    private var remaining = 0L
    private var running = false

    private val ticker = object : Runnable {
        override fun run() {
            if (!running) return
            remaining = ((endAt - System.currentTimeMillis() + 999L) / 1000L).coerceAtLeast(0L)
            if (remaining <= 0L) finishTimer() else handler.postDelayed(this, 500L)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startTimer(intent.getIntExtra(EXTRA_SECONDS, 60).coerceIn(1, 7200))
            ACTION_PAUSE -> pauseTimer()
            ACTION_RESUME -> resumeTimer(intent.getIntExtra(EXTRA_SECONDS, 0))
            ACTION_STOP -> stopTimer()
            else -> stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun startTimer(seconds: Int) {
        remaining = seconds.toLong()
        endAt = System.currentTimeMillis() + remaining * 1000L
        running = true
        saveState("running")
        showTimerNotification()
        handler.removeCallbacks(ticker)
        handler.post(ticker)
    }

    private fun pauseTimer() {
        if (!running && remaining <= 0L) { stopTimer(); return }
        if (running) remaining = ((endAt - System.currentTimeMillis() + 999L) / 1000L).coerceAtLeast(0L)
        running = false
        handler.removeCallbacks(ticker)
        if (remaining <= 0L) finishTimer() else {
            saveState("paused")
            showPausedNotification()
        }
    }

    private fun resumeTimer(requestedSeconds: Int) {
        if (requestedSeconds > 0) remaining = requestedSeconds.toLong()
        if (remaining <= 0L) { stopTimer(); return }
        endAt = System.currentTimeMillis() + remaining * 1000L
        running = true
        saveState("running")
        showTimerNotification()
        handler.removeCallbacks(ticker)
        handler.post(ticker)
    }

    private fun stopTimer() {
        running = false
        handler.removeCallbacks(ticker)
        remaining = 0L
        endAt = 0L
        saveState("stopped")
        stopForeground(true)
        stopSelf()
    }

    private fun finishTimer() {
        running = false
        handler.removeCallbacks(ticker)
        remaining = 0L
        endAt = 0L
        saveState("finished")
        val notification = NotificationCompat.Builder(this, DONE_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Descanso concluído!")
            .setContentText("Hora de voltar ao treino 💪")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setDefaults(Notification.DEFAULT_SOUND or Notification.DEFAULT_VIBRATE)
            .build()
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification)
        stopForeground(false)
        stopSelf()
    }

    private fun saveState(state: String) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putString("state", state).putLong("remaining", remaining).putLong("endAt", endAt).apply()
    }

    private fun showTimerNotification() {
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Descanso do treino")
            .setContentText("Tempo restante")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setContentIntent(appPendingIntent())
            .addAction(android.R.drawable.ic_media_pause, "Pausar", servicePendingIntent(ACTION_PAUSE, 1))
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Encerrar", servicePendingIntent(ACTION_STOP, 2))
        if (Build.VERSION.SDK_INT >= 24) builder.setWhen(endAt).setUsesChronometer(true).setChronometerCountDown(true)
        else builder.setContentText("Restam " + formatTime(remaining))
        startForegroundCompat(builder.build())
    }

    private fun showPausedNotification() {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Descanso pausado")
            .setContentText("Restam " + formatTime(remaining))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(appPendingIntent())
            .addAction(android.R.drawable.ic_media_play, "Continuar", servicePendingIntent(ACTION_RESUME, 3))
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Encerrar", servicePendingIntent(ACTION_STOP, 2))
            .build()
        startForegroundCompat(notification)
    }

    private fun startForegroundCompat(notification: Notification) {
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(NOTIFICATION_ID, notification)
    }

    private fun appPendingIntent(): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(this, 4, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun servicePendingIntent(action: String, requestCode: Int): PendingIntent {
        val intent = Intent(this, RestTimerService::class.java).setAction(action)
        return PendingIntent.getService(this, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT >= 26) {
            val manager = getSystemService(NotificationManager::class.java)
            val timerChannel = NotificationChannel(CHANNEL_ID, "Temporizador de descanso", NotificationManager.IMPORTANCE_LOW)
            timerChannel.description = "Contagem regressiva durante os intervalos do treino"
            timerChannel.setSound(null, null)
            manager.createNotificationChannel(timerChannel)
            val doneChannel = NotificationChannel(DONE_CHANNEL_ID, "Descanso concluído", NotificationManager.IMPORTANCE_HIGH)
            doneChannel.description = "Aviso quando o intervalo terminar"
            doneChannel.enableVibration(true)
            doneChannel.setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build())
            manager.createNotificationChannel(doneChannel)
        }
    }

    private fun formatTime(seconds: Long): String = "%02d:%02d".format(seconds / 60L, seconds % 60L)
    override fun onBind(intent: Intent?): IBinder? = null
}
