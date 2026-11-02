//
//  SafariWebExtensionHandler.swift
//  SpelareDev Extension
//
//  Created by alex on 2026-11-01.
//

import SafariServices
import os.log

// Native side of Spelare's iCloud sync (extension/background.js). The
// background page sends { type: "icloud-get" } to read what other devices
// stored, and { type: "icloud-set", values: { key: "<JSON>" } } to store its
// own. Values are JSON strings, kept in iCloud's key-value store under a
// "spelare." prefix; without an iCloud account the store just stays local.
class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    private let keyPrefix = "spelare."
    // iCloud's key-value store allows 1 MB per value.
    private let maxValueLength = 1_000_000

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        let reply = handle(message as? [String: Any] ?? [:])

        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: reply]
        } else {
            response.userInfo = ["message": reply]
        }
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

    private func handle(_ message: [String: Any]) -> [String: Any] {
        let store = NSUbiquitousKeyValueStore.default
        switch message["type"] as? String {
        case "icloud-get":
            store.synchronize()
            var values: [String: String] = [:]
            for (key, value) in store.dictionaryRepresentation where key.hasPrefix(keyPrefix) {
                if let json = value as? String {
                    values[String(key.dropFirst(keyPrefix.count))] = json
                }
            }
            return ["values": values]
        case "icloud-set":
            guard let values = message["values"] as? [String: Any] else {
                return ["error": "No values"]
            }
            for (key, value) in values {
                guard let json = value as? String, json.utf8.count <= maxValueLength else { continue }
                store.set(json, forKey: keyPrefix + key)
            }
            store.synchronize()
            return ["ok": true]
        default:
            os_log(.default, "Spelare: unknown native message %@", String(describing: message["type"]))
            return ["error": "Unknown message"]
        }
    }

}
