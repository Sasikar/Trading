package com.sasikar.trading

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

class PriceRefreshWorker(appContext: Context, params: WorkerParameters) :
    Worker(appContext, params) {
    override fun doWork(): Result {
        return try {
            MarketWidget.refreshAllBlocking(applicationContext)
            Result.success()
        } catch (_: Throwable) {
            Result.retry()
        }
    }
}
