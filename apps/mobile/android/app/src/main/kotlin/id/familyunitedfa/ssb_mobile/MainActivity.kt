package id.familyunitedfa.ssb_mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Android 8+: notifikasi push harus punya saluran; id sama dengan meta-data di manifest.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(
                NotificationChannel("ssb_umum", "Pemberitahuan SSB", NotificationManager.IMPORTANCE_HIGH)
            )
        }
    }
}
