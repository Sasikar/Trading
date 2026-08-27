package com.sasikar.trading

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

class MarketWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { id ->
            val views = RemoteViews(context.packageName, R.layout.market_widget)
            views.setTextViewText(R.id.title, "BTC  ·  ETH")
            views.setTextViewText(R.id.values, "Open Trading for live prices")
            manager.updateAppWidget(id, views)
        }
    }
}
