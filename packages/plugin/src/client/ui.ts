import type {
  ComponentType,
  FunctionComponent,
  ReactNode,
  ForwardRefExoticComponent,
  RefAttributes,
  ReactElement,
  Ref,
} from "react";
import type {
  StyleProp,
  ViewStyle,
  ScrollView as NativeScrollView,
  ScrollViewProps,
  FlatList as NativeFlatList,
  FlatListProps,
  TextInput as NativeTextInput,
  TextInputProps,
  TextProps,
} from "react-native";
import type { PluginIconProps } from "../icons.js";
import type { PluginIcon } from "./contracts.js";

export interface ModalProps {
  title: string;
  icon?: ReactNode;
  open: boolean;
  onOpenChange(open: boolean): void;
  children: ReactNode;
}

export interface ModalContentProps {
  children: ReactNode;
  /** Paint the full body below the header. */
  style?: StyleProp<ViewStyle>;
  /** Overrides the default 24px padding and 16px gap. Safe-area clearance stays host-owned. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Default true. Set false for a bounded body with your own ScrollView or FlatList. */
  scrollable?: boolean;
}

export interface ModalComponent extends FunctionComponent<ModalProps> {
  Content: ComponentType<ModalContentProps>;
}

export type ToastVariant = "default" | "info" | "success" | "warning" | "error";

export interface ToastOptions {
  variant?: ToastVariant;
  durationMs?: number;
}

export interface ToastApi {
  show(message: string, options?: ToastOptions): void;
  error(message: string): void;
}

/** Renders a Lucide icon by `name`, or any plugin icon by `icon`. An unusable icon renders nothing. */
export type IconProps = Partial<PluginIconProps> &
  ({ name: string; icon?: never } | { icon: PluginIcon; name?: never });

export declare const Icon: ComponentType<IconProps>;
export declare const Modal: ModalComponent;
export declare function useToast(): ToastApi;
export interface StreamedTextProps extends Omit<TextProps, "children"> {
  text: string;
  phase: "streaming" | "complete";
}
/** Plain assistant text with host-owned streaming pacing and typography. */
export declare const StreamedText: ComponentType<StreamedTextProps>;

export type { PluginIconProps } from "../icons.js";

/** React Native scrolling with the host's sheet gestures when rendered inside a sheet. */
export declare const ScrollView: ForwardRefExoticComponent<
  ScrollViewProps & RefAttributes<NativeScrollView>
>;
export declare function FlatList<Item>(
  props: FlatListProps<Item> & { ref?: Ref<NativeFlatList<Item>> },
): ReactElement;
/** Copies text to this client's clipboard. Rejects when copying is unavailable or denied. */
export declare function copyText(text: string): Promise<void>;

/** Native input focus integrated with modal keyboard positioning. */
export declare const TextInput: ForwardRefExoticComponent<
  TextInputProps & RefAttributes<NativeTextInput>
>;

export interface SettingsSectionProps {
  title: string;
  info?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  testID?: string;
}
export interface SettingsRowProps {
  label: string;
  hint?: string;
  error?: string | null;
  children?: ReactNode;
  testID?: string;
}
export interface SettingsSwitchProps extends SettingsRowProps {
  value: boolean;
  onValueChange(value: boolean): void;
  disabled?: boolean;
}
export interface SettingsSelectProps<Value extends string = string> extends SettingsRowProps {
  value: Value;
  options: readonly { label: string; value: Value }[];
  onValueChange(value: Value): void;
  disabled?: boolean;
}
export interface SettingsInputHandle {
  focus(): void;
  blur(): void;
  getText(): string;
  replaceText(text: string): void;
}
export interface SettingsInputProps extends SettingsRowProps {
  initialValue?: string;
  onChangeText(text: string): void;
  placeholder?: string;
  disabled?: boolean;
  secureTextEntry?: boolean;
  ref?: Ref<SettingsInputHandle>;
}
export interface SettingsActionProps extends SettingsRowProps {
  actionLabel: string;
  onPress(): void;
  disabled?: boolean;
}
// COMPAT(pluginSettingsGroup): added in v0.13.0, remove after 2027-04-20
/** @deprecated Use SettingsSection for plugin settings headings. */
export declare const SettingsGroup: ComponentType<SettingsSectionProps>;
export declare const SettingsSection: ComponentType<SettingsSectionProps>;
export declare const SettingsCard: ComponentType<{ children: ReactNode; testID?: string }>;
export declare const SettingsRow: ComponentType<SettingsRowProps>;
export declare const SettingsSwitch: ComponentType<SettingsSwitchProps>;
export declare function SettingsSelect<Value extends string>(
  props: SettingsSelectProps<Value>,
): ReactNode;
export declare const SettingsInput: ComponentType<SettingsInputProps>;
export declare const SettingsAction: ComponentType<SettingsActionProps>;

export interface ExternalLinkProps {
  href: string;
  children: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
  onError?: (error: unknown) => void;
}
export declare const ExternalLink: ComponentType<ExternalLinkProps>;

export type SidebarIcon = PluginIcon;
export interface SidebarRowProps {
  /**
   * Tells rows of one item apart when the item renders several: "bot-2". Unique within the item.
   * Omit it when the item renders one row.
   */
  id?: string;
  /** A Lucide icon name, inline SVG, or a component. */
  icon?: SidebarIcon;
  /** Defaults to the item's registered title. */
  label?: string;
  onPress(): void;
  active?: boolean;
  /** Right slot. Renders beside the row's pressable, so a button here presses on its own. */
  trailing?: ReactNode;
}
/** A sidebar navigation row. Render it from a sidebar item's `Component`. */
export declare const SidebarRow: ComponentType<SidebarRowProps>;
/** A line between groups of rows. Render it from a sidebar item's `Component`. */
export declare const SidebarSeparator: ComponentType;

export type WorkspaceRowBadgeTone = "muted" | "success" | "warning" | "danger" | "info";
export interface WorkspaceRowBadgeProps {
  /** A Lucide icon name, inline SVG, or a component. */
  icon?: SidebarIcon;
  label?: string;
  /** Default "muted". */
  tone?: WorkspaceRowBadgeTone;
  /** Defaults to `label`, then the item's `title`. */
  accessibilityLabel?: string;
}
/** One item on a sidebar workspace row's meta line. Render it from a workspace row badge item's `Component`. */
export declare const WorkspaceRowBadge: ComponentType<WorkspaceRowBadgeProps>;

/** Paseo's loading state. Fills the panel; the panel decides when to show it. */
export declare const Loading: ComponentType;

/** Render a local document URL in an isolated frame. */
export declare const DocumentFrame: ComponentType<{ url: string; testID?: string }>;

export interface HtmlFrameCsp {
  /**
   * Origins (optionally with a path prefix ending in "/") the page may load scripts, styles,
   * images, fonts and media from: "https://host[:port][/path/]", with an optional leading "*." on
   * the host. Anything else is dropped and reported through `onError`.
   */
  resourceDomains?: readonly string[];
  /**
   * Origins the page may reach with fetch, XHR, WebSocket and EventSource: "https://..." or
   * "wss://...", same rules. Default: none.
   */
  connectDomains?: readonly string[];
}

export interface HtmlFrameHandle {
  /** Deliver a JSON-serializable value (4 MB at most) to the page as a `message` event. */
  postMessage(message: unknown): void;
}

export interface HtmlFrameProps {
  /** A full document or a fragment. Paseo adds the doctype, CSP, viewport and a bootstrap script first. */
  html: string;
  csp?: HtmlFrameCsp;
  /**
   * A trusted HTTPS origin to load the document from on native (default `about:blank`). A real
   * origin gives the page a secure context, which APIs such as WebCodecs require; relative URLs
   * resolve there. Ignored on web, where the frame stays a sandboxed `srcdoc`. Navigation away is
   * still refused.
   */
  baseUrl?: string;
  /** Size to the content, clamped to `min`/`max` px (default `{ min: 80, max: 1400 }`). `false` uses `height`. */
  autoHeight?: { min?: number; max?: number } | false;
  /** Height in px when `autoHeight` is false, and the starting height before the first measure. */
  height?: number;
  /** Fill the parent (`flex: 1`), for a full-screen host. Overrides `height` and `autoHeight`. */
  fill?: boolean;
  /** Scroll inside the frame. Default false when auto-sizing (unless content outgrows `max`), true otherwise. */
  scrollEnabled?: boolean;
  /** When false the native view is unmounted and a same-size placeholder kept. Default true. */
  active?: boolean;
  /** The page's measured content height in px, before clamping. */
  onContentHeight?(height: number): void;
  /** Every JSON value the page posts with `window.parent.postMessage`. */
  onMessage?(message: unknown): void;
  /** Script errors in the page, refused messages and CSP entries that were dropped. */
  onError?(message: string): void;
  onLoad?(): void;
  testID?: string;
}

/**
 * Run HTML in an isolated, sandboxed frame: no storage, cookies or navigation, and network only to
 * the origins in `csp`. The page sees `document.documentElement.dataset.paseoPlatform` ("ios",
 * "android" or "web") and talks to the host with `window.parent.postMessage` on every platform;
 * the host talks back with `ref.postMessage`. A message the host posts before the page loads is
 * held until it has, but the page may still register its listener later, so start with a handshake
 * from the page.
 */
export declare const HtmlFrame: ForwardRefExoticComponent<
  HtmlFrameProps & RefAttributes<HtmlFrameHandle>
>;

export interface MarkdownProps {
  children: string;
}

/** Renders Markdown using Paseo’s theme, selection, and link behavior. */
export declare const Markdown: ComponentType<MarkdownProps>;

export interface ComposerControlProps {
  /** The control's label and tooltip. */
  title: string;
  /** A Lucide icon name, inline SVG, or a component. */
  icon: PluginIcon;
  disabled?: boolean;
}
/**
 * What a control's callback receives. A returned promise marks the control pending until it
 * settles, and Paseo reports a rejection to the user.
 */
export interface ToggleProps extends ComposerControlProps {
  value: boolean;
  onValueChange(event: { value: boolean }): void | Promise<void>;
}
export interface SelectProps<Value extends string = string> extends ComposerControlProps {
  value: Value;
  options: readonly { value: Value; label: string; description?: string }[];
  onValueChange(event: { value: Value }): void | Promise<void>;
}
export interface ActionPressEvent {}
export interface ActionProps extends ComposerControlProps {
  onPress(event: ActionPressEvent): void | Promise<void>;
}
/** One result of a `Combobox` search. Extra fields ride along to `onSelect`. */
export interface ComboboxItem {
  id: string;
  label: string;
  description?: string;
}
export interface ComboboxSearchEvent {
  /** Empty when the list opens. */
  query: string;
}
export interface ComboboxProps<
  Item extends ComboboxItem = ComboboxItem,
> extends ComposerControlProps {
  /** What the control shows. It need not be among the search results. */
  value: ComboboxItem | null;
  /**
   * Called when the list opens and again, debounced, as the user types. Paseo shows the loading
   * and error states, keeps the previous results while a search runs, and ignores a search that a
   * newer one replaced.
   */
  search(event: ComboboxSearchEvent): Promise<readonly Item[]>;
  onSelect(event: { item: Item }): void | Promise<void>;
}
/**
 * Paseo's controls. Render them from a composer item's or a New workspace item's `Component`.
 * Paseo draws them where the item sits: inline when the composer has room and as rows in its
 * overflow sheet when it does not, and as a field in the New workspace setup.
 */
export declare const Toggle: ComponentType<ToggleProps>;
export declare function Select<Value extends string>(props: SelectProps<Value>): ReactNode;
export declare const Action: ComponentType<ActionProps>;
export declare function Combobox<Item extends ComboboxItem>(props: ComboboxProps<Item>): ReactNode;
