"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { NativeIosEnvironment, TagNfcPlugin } from "./native-ios";

/**
 * The real environment for `createNativeIosWriter`: inside the iPhone app the
 * Capacitor bridge is injected into this page and TagNfc is registered; in a
 * browser neither is, and this reports so.
 */
const tagNfc = registerPlugin<TagNfcPlugin>("TagNfc");

export function capacitorEnvironment(): NativeIosEnvironment {
  const isNativeIos =
    typeof window !== "undefined" &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable("TagNfc");
  return { isNativeIos, plugin: isNativeIos ? tagNfc : null };
}
