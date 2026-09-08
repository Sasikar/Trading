package com.sasikar.trading

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object PriceStore {
    const val PREFS = "market_widget_cache"

    fun formatPrice(price: Double): String = when {
        price >= 1000 -> String.format(Locale.US, "$%,.0f", price)
        price >= 1 -> String.format(Locale.US, "$%,.2f", price)
        else -> String.format(Locale.US, "$%.4f", price)
    }

    fun nowStamp(): String =
        SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date())

    fun ageLabel(fromMs: Long): String {
        if (fromMs <= 0L) return "—"
        val mins = ((System.currentTimeMillis() - fromMs) / 60000L).coerceAtLeast(0L)
        return when {
            mins <= 0L -> "just now"
            mins == 1L -> "1m ago"
            mins < 60L -> "${mins}m ago"
            else -> {
                val h = mins / 60L
                val m = mins % 60L
                if (m == 0L) "${h}h ago" else "${h}h ${m}m ago"
            }
        }
    }

    private fun httpGet(urlString: String): String {
        var last: Exception? = null
        repeat(3) { attempt ->
            var conn: HttpURLConnection? = null
            try {
                conn = (URL(urlString).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 20000
                    readTimeout = 20000
                    requestMethod = "GET"
                    instanceFollowRedirects = true
                    useCaches = false
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty(
                        "User-Agent",
                        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/121.0.0.0 Mobile Safari/537.36"
                    )
                }
                val code = conn.responseCode
                val stream = if (code in 200..299) conn.inputStream else conn.errorStream
                val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
                if (code in 200..299 && body.isNotBlank()) return body
                last = IllegalStateException("HTTP $code")
            } catch (e: Exception) {
                last = e
                try { Thread.sleep(300L * (attempt + 1)) } catch (_: InterruptedException) {}
            } finally {
                try { conn?.disconnect() } catch (_: Throwable) {}
            }
        }
        throw last ?: IllegalStateException("GET failed")
    }

    /** Load JSON from our Pages feed (primary). */
    fun fetchFeedJson(): JSONObject {
        val t = System.currentTimeMillis()
        val urls = listOf(
            "https://sasikar.github.io/Trading/data/widget-prices.json?t=$t",
            "https://cdn.jsdelivr.net/gh/Sasikar/Trading@master/data/widget-prices.json?t=$t",
            "https://raw.githubusercontent.com/Sasikar/Trading/master/data/widget-prices.json?t=$t"
        )
        var last: Exception? = null
        for (u in urls) {
            try {
                return JSONObject(httpGet(u))
            } catch (e: Exception) {
                last = e
            }
        }
        throw last ?: IllegalStateException("All feeds failed")
    }

    fun applyFeed(context: Context, root: JSONObject): Boolean {
        val edit = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        var ok = false
        fun num(key: String) {
            try {
                if (!root.isNull(key)) {
                    val v = root.getDouble(key)
                    if (v > 0) {
                        edit.putString(key, formatPrice(v))
                        ok = true
                    }
                }
            } catch (_: Throwable) {
                try {
                    val v = root.optString(key, "").toDoubleOrNull()
                    if (v != null && v > 0) {
                        edit.putString(key, formatPrice(v))
                        ok = true
                    }
                } catch (_: Throwable) {}
            }
        }
        num("bitcoin"); num("ethereum"); num("solana")
        val fomo = root.optString("fomo", "")
        if (fomo.isNotBlank()) {
            edit.putString("fomo", fomo)
            ok = true
        }
        val ndx = root.optString("nasdaq", "")
        if (ndx.isNotBlank()) {
            edit.putString("nasdaq", ndx)
            edit.putString("nasdaq_dir", root.optString("nasdaq_dir", "flat"))
            ok = true
        }
        if (ok) {
            edit.putLong("last_refreshed_ms", System.currentTimeMillis())
            edit.putString("last_refreshed", "Updated " + nowStamp())
        } else {
            edit.putString("last_refreshed", "Feed empty")
        }
        edit.commit()
        return ok
    }

    fun refreshFromNetwork(context: Context): Boolean {
        return try {
            val feed = fetchFeedJson()
            applyFeed(context, feed)
        } catch (e: Exception) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("last_refreshed", "Err: " + (e.message ?: "net").take(48))
                .commit()
            false
        }
    }

    fun read(context: Context): Map<String, String> {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val keys = listOf("bitcoin", "ethereum", "solana", "fomo", "nasdaq", "nasdaq_dir", "last_refreshed")
        return keys.mapNotNull { k -> p.getString(k, null)?.let { k to it } }.toMap()
    }

    fun lastMs(context: Context): Long =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong("last_refreshed_ms", 0L)

    fun summary(context: Context): String {
        val c = read(context)
        val btc = c["bitcoin"]
        return if (btc != null) "BTC $btc · ETH ${c["ethereum"] ?: "—"}"
        else c["last_refreshed"] ?: "No data"
    }
}
