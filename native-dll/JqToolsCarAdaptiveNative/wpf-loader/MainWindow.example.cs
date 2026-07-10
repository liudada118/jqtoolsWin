using System;
using System.Windows;

namespace Demo;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        Loaded += HandleLoaded;
        Closed += HandleClosed;
    }

    private void HandleLoaded(object sender, RoutedEventArgs e)
    {
        JqTools.CarAdaptive.NativeLoader.JqToolsCarAdaptiveNative.Start();

        // WebView 是 XAML 里的 Microsoft.Web.WebView2.Wpf.WebView2 控件。
        WebView.Source = new Uri(JqTools.CarAdaptive.NativeLoader.JqToolsCarAdaptiveNative.GetDebugUrl());
    }

    private void HandleClosed(object? sender, EventArgs e)
    {
        JqTools.CarAdaptive.NativeLoader.JqToolsCarAdaptiveNative.Stop();
    }
}
