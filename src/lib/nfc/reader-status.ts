"use client";

import { useEffect, useSyncExternalStore } from "react";
import { isInMacApp } from "@pmops/nfc-writer";
import { deskReader, rememberDeskReader, rememberedDeskReader } from "./writer";

/**
 * Whether the NFC reader/writer on this computer is connected, shared by every
 * screen that uses it.
 *
 * In the Clearline Mac app, and in a browser that has used the reader/writer
 * before, it is watched continuously: plug it in and it connects on its own
 * within a couple of seconds, unplug it and the screens say so. Nobody has to
 * press anything. Watching pauses while a tag is being written, so a status
 * check never lands in the middle of a pairing.
 */

export type ReaderState =
  | { state: "idle" }
  | { state: "connecting" }
  | { state: "ready"; reader: string }
  | { state: "unavailable"; hint: string };

export const READER_NAME = "NFC reader/writer";

/** How often to look while nothing is plugged in, and while something is. */
const LOOK_MS = 2_000;
const CHECK_MS = 5_000;

let current: ReaderState = { state: "idle" };
const listeners = new Set<() => void>();
let busy = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function set(next: ReaderState) {
  const same = next.state === current.state
    && (next.state !== "ready" || (current.state === "ready" && next.reader === current.reader))
    && (next.state !== "unavailable" || (current.state === "unavailable" && next.hint === current.hint));
  if (same) return;
  current = next;
  listeners.forEach((fn) => fn());
}

async function look(quiet: boolean) {
  if (!quiet) set({ state: "connecting" });
  const status = await deskReader.probe();
  if (deskReader.isSupported() && status.reader) {
    rememberDeskReader();
    set({ state: "ready", reader: status.reader });
  } else {
    set({ state: "unavailable", hint: status.hint ?? `No ${READER_NAME} found.` });
  }
}

function shouldWatch() {
  return isInMacApp() || rememberedDeskReader();
}

function schedule() {
  if (timer || listeners.size === 0 || !shouldWatch()) return;
  timer = setTimeout(async () => {
    timer = null;
    if (busy === 0) await look(true).catch(() => {});
    schedule();
  }, current.state === "ready" ? CHECK_MS : LOOK_MS);
}

/** Look for the reader/writer now, because someone asked. Starts watching it. */
export async function connectReader() {
  await look(false);
  schedule();
}

/** Run a tag operation with the watching paused. */
export async function withReader<T>(fn: () => Promise<T>): Promise<T> {
  busy += 1;
  try {
    return await fn();
  } finally {
    busy -= 1;
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/** The reader/writer's state, connecting and watching it when this computer has one. */
export function useReaderStatus(): ReaderState {
  const state = useSyncExternalStore(subscribe, () => current, () => current);
  useEffect(() => {
    if (current.state === "idle" && shouldWatch()) void look(false).then(schedule);
    else schedule();
  }, []);
  return state;
}
