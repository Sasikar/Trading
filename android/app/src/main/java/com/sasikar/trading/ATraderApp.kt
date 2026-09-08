package com.sasikar.trading

import android.app.Application
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

class ATraderApp : Application() {
    override fun onCreate() {
        super.onCreate()
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        // Minimum period for PeriodicWork is 15 min; AlarmManager still does 5 min when allowed
        val req = PeriodicWorkRequestBuilder<PriceRefreshWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "atrader_price_refresh",
            ExistingPeriodicWorkPolicy.UPDATE,
            req
        )
    }
}
