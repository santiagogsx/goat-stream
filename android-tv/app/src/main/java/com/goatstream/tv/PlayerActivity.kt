package com.goatstream.tv

import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.HttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.ui.PlayerView
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Native 4K player (Media3 ExoPlayer):
 *  - hardware decoding of H.264 / HEVC / VP9 / AV1, HDR10 / HLG / Dolby Vision when the TV supports it
 *  - Dolby Digital / Dolby Digital+ / Atmos / DTS / TrueHD passed straight to the TV or receiver (passthrough)
 *  - big buffer for smooth 4K over Wi-Fi and the cloud
 *  - switches the TV's refresh rate to match the movie (24p judder-free)
 */
@OptIn(UnstableApi::class)
class PlayerActivity : ComponentActivity() {
    companion object {
        const val EXTRA_REQUEST = "req"
        const val EXTRA_RESULT = "result"
    }

    private var player: ExoPlayer? = null
    private lateinit var view: PlayerView
    private var itemId = ""
    private var offsetMs = 0L
    private var reason = "back"
    private var errorMsg = ""
    private var done = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val req = JSONObject(intent.getStringExtra(EXTRA_REQUEST) ?: "{}")
        itemId = req.optString("id")
        offsetMs = req.optLong("offsetMs", 0)

        // ----- layout: player + title shown together with the controls -----
        view = PlayerView(this).apply {
            setBackgroundColor(Color.BLACK)
            keepScreenOn = true
            setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS)
            controllerShowTimeoutMs = 3500
            setShowSubtitleButton(true)
        }
        val titleBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(32), dp(24), dp(32), dp(24))
            setBackgroundColor(Color.argb(150, 0, 0, 0))
            addView(TextView(this@PlayerActivity).apply {
                text = req.optString("title")
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            })
            val sub = req.optString("subtitle")
            if (sub.isNotBlank()) addView(TextView(this@PlayerActivity).apply {
                text = sub
                setTextColor(Color.parseColor("#FFD978"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            })
        }
        val root = FrameLayout(this)
        root.addView(view, FrameLayout.LayoutParams(-1, -1))
        root.addView(titleBox, FrameLayout.LayoutParams(-1, -2, Gravity.TOP))
        setContentView(root)
        view.setControllerVisibilityListener(PlayerView.ControllerVisibilityListener { v -> titleBox.visibility = v })

        // ----- player -----
        val headers = HashMap<String, String>()
        req.optJSONObject("headers")?.let { h -> h.keys().forEach { headers[it] = h.getString(it) } }
        val http = DefaultHttpDataSource.Factory()
            .setUserAgent("GoatStream/1.0 (Android TV)")
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(45_000)
            .setDefaultRequestProperties(headers)
        val dataSource = DefaultDataSource.Factory(this, http)

        // 4K remuxes run 50–100 Mbit/s: buffer generously, but stay inside the app's memory
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(30_000, 120_000, 2_000, 4_000)
            .setTargetBufferBytes(180 * 1024 * 1024)
            .setPrioritizeTimeOverSizeThresholds(false)
            .build()
        val renderers = DefaultRenderersFactory(this).setEnableDecoderFallback(true)
        val trackSelector = DefaultTrackSelector(this).apply {
            setParameters(
                buildUponParameters()
                    .setPreferredAudioLanguage(java.util.Locale.getDefault().language)
                    // Pick the best audio the TV / receiver can take (Atmos, DTS-HD…) and fall back gracefully
                    .setExceedAudioConstraintsIfNecessary(true)
                    .setExceedRendererCapabilitiesIfNecessary(true)
                    .setExceedVideoConstraintsIfNecessary(true)
            )
        }

        player = ExoPlayer.Builder(this, renderers)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSource))
            .setLoadControl(loadControl)
            .setTrackSelector(trackSelector)
            .setVideoChangeFrameRateStrategy(C.VIDEO_CHANGE_FRAME_RATE_STRATEGY_ONLY_IF_SEAMLESS)
            .build().also { p ->
                view.player = p
                val item = MediaItem.Builder()
                    .setUri(req.optString("url"))
                    .setMediaMetadata(MediaMetadata.Builder().setTitle(req.optString("title")).build())
                    .build()
                p.setMediaItem(item, req.optLong("startMs", 0))
                p.addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(state: Int) {
                        if (state == Player.STATE_ENDED) { reason = "ended"; finishWithResult() }
                    }

                    override fun onPlayerError(error: PlaybackException) {
                        val cause = error.cause
                        if (cause is HttpDataSource.InvalidResponseCodeException && cause.responseCode in listOf(401, 403, 410)) {
                            reason = "auth"          // cloud link expired — the UI refreshes it and resumes
                        } else {
                            reason = "error"         // the UI retries through the PC's converter
                            errorMsg = error.errorCodeName
                        }
                        finishWithResult()
                    }

                    override fun onTracksChanged(tracks: Tracks) {
                        matchRefreshRate(tracks)
                    }
                })
                p.prepare()
                p.playWhenReady = true
            }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (view.isControllerFullyVisible) view.hideController() else finishWithResult()
            }
        })
    }

    // Remote keys go to the player controls (play/pause, seek, audio & subtitle tracks)
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK) return super.dispatchKeyEvent(event)
        if (event.action == KeyEvent.ACTION_DOWN && !view.isControllerFullyVisible) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_LEFT -> { seekBy(-10_000); view.showController(); return true }
                KeyEvent.KEYCODE_DPAD_RIGHT -> { seekBy(10_000); view.showController(); return true }
            }
        }
        return view.dispatchKeyEvent(event) || super.dispatchKeyEvent(event)
    }

    private fun seekBy(ms: Long) {
        val p = player ?: return
        if (p.isCurrentMediaItemSeekable) p.seekTo((p.currentPosition + ms).coerceAtLeast(0))
    }

    /** Switch the TV to a refresh rate that is a whole multiple of the movie's frame rate (e.g. 24 Hz for films). */
    private fun matchRefreshRate(tracks: Tracks) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        var fps = -1f
        for (g in tracks.groups) {
            if (g.type != C.TRACK_TYPE_VIDEO || !g.isSelected) continue
            for (i in 0 until g.length) if (g.isTrackSelected(i)) fps = g.getTrackFormat(i).frameRate
        }
        if (fps <= 0f) return
        @Suppress("DEPRECATION")
        val display = windowManager.defaultDisplay ?: return
        val cur = display.mode
        val best = display.supportedModes
            .filter { it.physicalWidth == cur.physicalWidth && it.physicalHeight == cur.physicalHeight }
            .map { it to it.refreshRate / fps }
            .filter { (_, ratio) -> ratio >= 0.99f && abs(ratio - ratio.roundToInt()) < 0.01f }
            .sortedWith(compareBy({ abs(it.second - it.second.roundToInt()) > 0.002f }, { it.first.refreshRate }))
            .firstOrNull()?.first ?: return
        if (best.modeId != cur.modeId) {
            window.attributes = window.attributes.also { it.preferredDisplayModeId = best.modeId }
        }
    }

    private fun finishWithResult() {
        if (done) return
        done = true
        val p = player
        val dur = p?.duration?.takeIf { it != C.TIME_UNSET && it > 0 } ?: 0L
        val res = JSONObject()
            .put("id", itemId)
            .put("pos", p?.currentPosition ?: 0L)
            .put("dur", dur)
            .put("offset", offsetMs)
            .put("reason", reason)
            .put("error", errorMsg)
        setResult(RESULT_OK, Intent().putExtra(EXTRA_RESULT, res.toString()))
        finish()
    }

    override fun onStop() {
        super.onStop()
        // Home button / TV turned off: report where we stopped
        if (!isChangingConfigurations) finishWithResult()
    }

    override fun onDestroy() {
        player?.release()
        player = null
        super.onDestroy()
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).roundToInt()
}
