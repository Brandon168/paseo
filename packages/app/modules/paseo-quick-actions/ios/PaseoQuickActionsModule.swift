import ExpoModulesCore

public class PaseoQuickActionsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PaseoQuickActions")

    Events("onQuickAction")

    OnStartObserving("onQuickAction") {
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(handleRecordedQuickAction),
        name: PaseoQuickActionRegistry.didRecordNotification,
        object: nil
      )
    }

    OnStopObserving("onQuickAction") {
      NotificationCenter.default.removeObserver(
        self,
        name: PaseoQuickActionRegistry.didRecordNotification,
        object: nil
      )
    }

    // Returns the action recorded since JavaScript last took one, then clears it.
    Function("takePendingAction") { () -> String? in
      PaseoQuickActionRegistry.shared.take()
    }
  }

  @objc func handleRecordedQuickAction(_ notification: Notification) {
    guard let type = PaseoQuickActionRegistry.shared.take() else {
      return
    }
    sendEvent("onQuickAction", ["id": type])
  }
}
