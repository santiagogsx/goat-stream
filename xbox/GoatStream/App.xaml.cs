// Goat Stream for Xbox — created by Santiago.
using System;
using Windows.ApplicationModel.Activation;
using Windows.UI.ViewManagement;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;

namespace GoatStream
{
    sealed partial class App : Application
    {
        public App()
        {
            InitializeComponent();

            // Xbox: drive the app with the controller, not a mouse-like cursor
            RequiresPointerMode = ApplicationRequiresPointerMode.WhenRequested;

            // Media buttons on a remote go to our player, not the web page; black while loading (no white flash);
            // the logo intro may play its sound without a click first
            Environment.SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                "--disable-features=HardwareMediaKeyHandling --autoplay-policy=no-user-gesture-required");
            Environment.SetEnvironmentVariable("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "FF000000");

            // Xbox doubles the size of apps by default; the web page already sizes itself for TVs
            ApplicationViewScaling.TrySetDisableLayoutScaling(true);
        }

        protected override void OnLaunched(LaunchActivatedEventArgs e)
        {
            if (!(Window.Current.Content is Frame frame))
            {
                frame = new Frame();
                Window.Current.Content = frame;
            }
            if (!e.PrelaunchActivated)
            {
                if (frame.Content == null) frame.Navigate(typeof(MainPage), e.Arguments);
                Window.Current.Activate();
            }
        }
    }
}
