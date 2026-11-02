//
//  AppDelegate.swift
//  SpelareDev
//
//  Created by alex on 2026-11-01.
//

import Cocoa
import Sparkle

@main
class AppDelegate: NSObject, NSApplicationDelegate {

    private var updaterController: SPUStandardUpdaterController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Release builds get a feed URL from scripts/release.sh; local builds have none and skip updates.
        let feedURL = Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") as? String ?? ""
        guard !feedURL.isEmpty else { return }

        let controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)
        updaterController = controller

        // People open this container app rarely, so check every time it launches.
        controller.updater.checkForUpdatesInBackground()

        let item = NSMenuItem(title: "Check for Updates…", action: #selector(SPUStandardUpdaterController.checkForUpdates(_:)), keyEquivalent: "")
        item.target = controller
        NSApp.mainMenu?.items.first?.submenu?.insertItem(item, at: 1)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

}
