package com.sasikar.trading

import android.app.Application

class ATraderApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // Alarms scheduled from MarketWidget onEnabled/onUpdate
    }
}
