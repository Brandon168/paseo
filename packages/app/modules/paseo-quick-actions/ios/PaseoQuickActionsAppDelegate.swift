import ExpoModulesCore
import UIKit

/// Holds the home screen quick action the user chose until JavaScript takes it.
///
/// A cold start delivers the action before React Native is running, so it cannot be sent as an
/// event yet. The registry keeps the latest one; the module hands it over once JavaScript asks.
final class PaseoQuickActionRegistry {
  static let shared = PaseoQuickActionRegistry()
  static let didRecordNotification = Notification.Name("PaseoQuickActionDidRecord")

  private let lock = NSLock()
  private var pendingType: String?

  func record(_ type: String) {
    lock.lock()
    pendingType = type
    lock.unlock()
    NotificationCenter.default.post(name: Self.didRecordNotification, object: nil)
  }

  func take() -> String? {
    lock.lock()
    defer { lock.unlock() }
    let type = pendingType
    pendingType = nil
    return type
  }
}

/// Receives quick actions for both a cold start (launch options or scene connection options,
/// which Expo's scene delegate forwards here) and a warm tap (`performActionFor`).
public class PaseoQuickActionsAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    if let item = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem {
      PaseoQuickActionRegistry.shared.record(item.type)
    }
    return true
  }

  public func application(
    _ application: UIApplication,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    PaseoQuickActionRegistry.shared.record(shortcutItem.type)
    completionHandler(true)
  }
}
