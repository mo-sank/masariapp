/**
 * Expo config plugin: adopt the UIKit scene lifecycle on iOS.
 *
 * Why: apps built with the iOS 27 SDK (Xcode 27) crash at launch with
 * `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` unless they
 * adopt UIScene. Expo SDK 57 / React Native 0.86 still generate an
 * AppDelegate-owned window, so the generated project has to be adjusted here.
 * See https://github.com/expo/expo/issues/46663 and TN3187.
 *
 * What it does:
 *   1. Adds `UIApplicationSceneManifest` to Info.plist, pointing at a
 *      `SceneDelegate` class.
 *   2. Stops AppDelegate from creating the window and starting React Native.
 *      It keeps the launch options so the scene can use them.
 *   3. Appends a `SceneDelegate` to AppDelegate.swift (same module, so no Xcode
 *      project changes are needed). It creates the window from the
 *      UIWindowScene and starts React Native there.
 *   4. Forwards URL and user-activity callbacks to RCTLinkingManager. Under the
 *      scene lifecycle, `application(_:open:options:)` is no longer called, so
 *      deep links (Auth0 callback, expo-dev-client Metro URL) would be lost.
 *
 * Remove this plugin once Expo ships official scene support.
 */
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const MARKER = '// masari-scene-delegate';

const SCENE_DELEGATE = `
${MARKER}
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    // Older code paths (including React Native) still read AppDelegate.window.
    appDelegate.window = window

    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: appDelegate.initialLaunchOptions)

    // A link that cold-launches the app arrives here, not in application(_:open:options:).
    for context in connectionOptions.urlContexts {
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
    for activity in connectionOptions.userActivities {
      RCTLinkingManager.application(
        UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    RCTLinkingManager.application(
      UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

// Matched separately (not as one block) so lines injected between them by other
// config plugins are left in place.
const WINDOW_RE = /^[ \t]*window = UIWindow\(frame: UIScreen\.main\.bounds\)\r?\n/m;
const START_RN_RE = /^[ \t]*factory\.startReactNative\(\r?\n[\s\S]*?launchOptions: launchOptions\)\r?\n/m;
const WINDOW_PROPERTY = '  var window: UIWindow?\n';

const withSceneAppDelegate = (config) =>
  withAppDelegate(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes(MARKER)) {
      return cfg;
    }

    const expected = [
      [WINDOW_RE, 'window creation'],
      [START_RN_RE, 'startReactNative call'],
    ];
    for (const [re, what] of expected) {
      if (!re.test(contents)) {
        throw new Error(
          `with-ios-scene-delegate: AppDelegate.swift has no ${what} to replace. ` +
            'The Expo template changed; update this plugin.',
        );
      }
    }
    if (!contents.includes(WINDOW_PROPERTY)) {
      throw new Error(
        "with-ios-scene-delegate: could not find AppDelegate's `var window` property.",
      );
    }

    contents = contents
      .replace(WINDOW_RE, '    initialLaunchOptions = launchOptions\n')
      .replace(START_RN_RE, '')
      .replace(
        WINDOW_PROPERTY,
        `${WINDOW_PROPERTY}  var initialLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?\n`,
      );

    cfg.modResults.contents = contents + SCENE_DELEGATE;
    return cfg;
  });

const withSceneManifest = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });

module.exports = (config) => withSceneManifest(withSceneAppDelegate(config));
