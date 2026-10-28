// Goat Stream for Xbox — the native 4K player. Created by Santiago.
//  - the console's hardware decoders: H.264 / HEVC / VP9 / AV1, MP4 and MKV, 4K with the hevcPlayback capability
//  - HDR10: switches the TV into HDR for HDR movies, and to a refresh rate matching the movie (24p judder-free)
//    when the owner allows it in the Xbox video settings ("Allow 24Hz", "Allow HDR10")
//  - Dolby Digital / DD+ / DTS sound goes out the way the Xbox audio settings say (bitstream to a receiver or decoded)
//  - the controller works the built-in controls; LB / RB jump back 10 s / forward 30 s; X = play/pause; B = back
// Reports back like the Android player: {id, pos, dur, offset, reason: back|ended|error|auth, error}.
using System;
using System.Threading.Tasks;
using Windows.Data.Json;
using Windows.Graphics.Display.Core;
using Windows.Media;
using Windows.Media.Core;
using Windows.Media.Playback;
using Windows.System;
using Windows.System.Display;
using Windows.UI.Core;
using Windows.UI.Xaml;

namespace GoatStream
{
    public sealed partial class MainPage
    {
        MediaPlayer player;
        bool playing;
        bool displayChanged;
        JsonObject req = new JsonObject();
        string itemId = "";
        long offsetMs;
        string errorMsg = "";
        DisplayRequest keepOn;
        DispatcherTimer titleTimer;

        void InitPlayer()
        {
            titleTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(4) };
            titleTimer.Tick += (s, e) => { TitleBox.Visibility = Visibility.Collapsed; titleTimer.Stop(); };
        }

        void OpenPlayer(JsonObject r)
        {
            if (playing) ClosePlayer("back");
            var url = r.GetNamedString("url", "");
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) { Toast("Couldn't start this movie."); return; }
            req = r;
            itemId = r.GetNamedString("id", "");
            offsetMs = (long)r.GetNamedNumber("offsetMs", 0);
            errorMsg = "";

            TitleText.Text = r.GetNamedString("title", "");
            SubtitleText.Text = r.GetNamedString("subtitle", "");
            SubtitleText.Visibility = SubtitleText.Text.Length > 0 ? Visibility.Visible : Visibility.Collapsed;

            // (cloud sign-in tokens ride in the address — app.js adds them — because this player can't send headers)
            var item = new MediaPlaybackItem(MediaSource.CreateFromUri(uri));
            var props = item.GetDisplayProperties();
            props.Type = MediaPlaybackType.Video;
            props.VideoProperties.Title = TitleText.Text;
            props.VideoProperties.Subtitle = SubtitleText.Text;
            item.ApplyDisplayProperties(props);

            player = new MediaPlayer { AutoPlay = false, Source = item };
            player.MediaOpened += OnOpened;
            player.MediaFailed += OnFailed;
            player.MediaEnded += OnEnded;
            Video.SetMediaPlayer(player);
            playing = true;

            // hide the web page while the movie plays (frees the console's memory for 4K)
            PlayerLayer.Visibility = Visibility.Visible;
            Web.Visibility = Visibility.Collapsed;
            ShowTitle();
            keepOn = new DisplayRequest();
            keepOn.RequestActive();
            Video.Focus(FocusState.Programmatic);
        }

        void OnOpened(MediaPlayer sender, object args)
        {
            RunOnUi(async () =>
            {
                if (sender != player) return;
                var start = Ms(req.GetNamedNumber("startMs", 0));
                if (start > 0 && sender.PlaybackSession.CanSeek) sender.PlaybackSession.Position = TimeSpan.FromMilliseconds(start);
                await MatchDisplay(sender);
                if (sender == player) sender.Play();
            });
        }

        static long Ms(double v) => (long)Math.Round(v);

        void OnEnded(MediaPlayer sender, object args) => RunOnUi(() => { if (sender == player) ClosePlayer("ended"); });

        void OnFailed(MediaPlayer sender, MediaPlayerFailedEventArgs a)
        {
            RunOnUi(() =>
            {
                if (sender != player) return;
                var played = sender.PlaybackSession.Position.TotalSeconds;
                var url = req.GetNamedString("url", "");
                errorMsg = a.Error + (string.IsNullOrEmpty(a.ErrorMessage) ? "" : ": " + a.ErrorMessage);
                // A cloud link that played for a while and then stopped = its sign-in ran out: the UI gets a fresh
                // link and continues. Anything else: the UI asks the PC to convert the movie (remux, then full convert).
                var expired = a.Error == MediaPlayerError.NetworkError && url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) && played > 60;
                ClosePlayer(expired ? "auth" : "error");
            });
        }

        /// Switch the TV to HDR for HDR movies, and to a refresh rate that is a whole multiple of the movie's frame rate.
        async Task MatchDisplay(MediaPlayer p)
        {
            try
            {
                var hdmi = HdmiDisplayInformation.GetForCurrentView();
                if (hdmi == null) return;                       // not a console / TV output
                var hdr = req.GetNamedBoolean("hdr", false);
                double fps = 0;
                if (p.Source is MediaPlaybackItem item && item.VideoTracks.Count > 0)
                {
                    var fr = item.VideoTracks[0].GetEncodingProperties().FrameRate;
                    if (fr.Denominator > 0) fps = (double)fr.Numerator / fr.Denominator;
                }
                var cur = hdmi.GetCurrentDisplayMode();
                HdmiDisplayMode best = null;
                var bestScore = double.MaxValue;
                foreach (var m in hdmi.GetSupportedDisplayModes())
                {
                    if (m.ResolutionWidthInRawPixels != cur.ResolutionWidthInRawPixels || m.ResolutionHeightInRawPixels != cur.ResolutionHeightInRawPixels) continue;
                    if (hdr && !m.IsSmpte2084Supported) continue;
                    double score;
                    if (fps > 1)
                    {
                        var ratio = m.RefreshRate / fps;
                        var off = Math.Abs(ratio - Math.Round(ratio));
                        if (ratio < 0.99 || off > 0.01) continue;
                        score = off * 1000 + m.RefreshRate;     // exact multiple first, then the lowest (24 Hz for films)
                    }
                    else score = Math.Abs(m.RefreshRate - cur.RefreshRate);
                    if (score < bestScore) { best = m; bestScore = score; }
                }
                if (best == null) return;
                if (!hdr && best.RefreshRate == cur.RefreshRate) return;   // nothing to change
                displayChanged = await hdmi.RequestSetCurrentDisplayModeAsync(best, hdr ? HdmiDisplayHdrOption.Eotf2084 : HdmiDisplayHdrOption.None);
            }
            catch (Exception) { /* the console said no (e.g. HDR or 24 Hz switched off in its settings): play as is */ }
        }

        void ClosePlayer(string reason)
        {
            if (!playing) return;
            playing = false;
            var p = player;
            player = null;
            long pos = 0, dur = 0;
            if (p != null)
            {
                try
                {
                    pos = Ms(p.PlaybackSession.Position.TotalMilliseconds);
                    var d = p.PlaybackSession.NaturalDuration.TotalMilliseconds;
                    dur = d > 0 && d < 1e10 ? Ms(d) : 0;     // live conversions have no real length
                }
                catch (Exception) { }
                p.MediaOpened -= OnOpened;
                p.MediaFailed -= OnFailed;
                p.MediaEnded -= OnEnded;
                p.Pause();
                Video.SetMediaPlayer(null);
                p.Dispose();
            }
            keepOn?.RequestRelease();
            keepOn = null;
            if (displayChanged)
            {
                displayChanged = false;
                _ = HdmiDisplayInformation.GetForCurrentView()?.SetDefaultDisplayModeAsync();
            }
            titleTimer.Stop();
            PlayerLayer.Visibility = Visibility.Collapsed;
            Web.Visibility = Visibility.Visible;
            Web.Focus(FocusState.Programmatic);

            var res = new JsonObject();
            res.SetNamedValue("id", JsonValue.CreateStringValue(itemId));
            res.SetNamedValue("pos", JsonValue.CreateNumberValue(pos));
            res.SetNamedValue("dur", JsonValue.CreateNumberValue(dur));
            res.SetNamedValue("offset", JsonValue.CreateNumberValue(offsetMs));
            res.SetNamedValue("reason", JsonValue.CreateStringValue(reason));
            res.SetNamedValue("error", JsonValue.CreateStringValue(errorMsg));
            var o = Msg("playerClosed");
            o.SetNamedValue("result", res);
            Send(o);
        }

        void OnPlayerKey(CoreWindow sender, KeyEventArgs e)
        {
            if (!playing || player == null) return;
            ShowTitle();
            var s = player.PlaybackSession;
            switch (e.VirtualKey)
            {
                case VirtualKey.GamepadLeftShoulder: Seek(-10); e.Handled = true; break;
                case VirtualKey.GamepadRightShoulder: Seek(30); e.Handled = true; break;
                case VirtualKey.GamepadX:
                    if (s.PlaybackState == MediaPlaybackState.Playing) player.Pause(); else player.Play();
                    e.Handled = true;
                    break;
            }
        }

        void Seek(int seconds)
        {
            var s = player?.PlaybackSession;
            if (s == null || !s.CanSeek) return;
            var t = s.Position + TimeSpan.FromSeconds(seconds);
            s.Position = t < TimeSpan.Zero ? TimeSpan.Zero : t;
        }

        void ShowTitle()
        {
            TitleBox.Visibility = Visibility.Visible;
            titleTimer.Stop();
            titleTimer.Start();
        }
    }
}
