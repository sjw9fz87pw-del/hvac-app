# Desk reader bridge

Pair tags from a computer with a USB NFC reader, instead of a phone.

A web page cannot reach USB, so `desk_reader.py` owns the reader and answers on
`http://127.0.0.1:8766`. The app's `desk-reader` TagWriter (`../src/desk-reader.ts`)
talks to it, and pairing runs the same write → read back → verify → link → lock
order as it does on a phone.

## Use it

1. Plug in the reader. Anything PC/SC works with macOS's built-in driver:
   ACR122U and clones, ACR1252, ACR1552, SCL3711, Identiv uTrust. No install.
2. Start the bridge and leave it running:

   ```bash
   python3 packages/nfc-writer/desk-reader/desk_reader.py --probe   # what's plugged in
   python3 packages/nfc-writer/desk-reader/desk_reader.py           # serve
   ```

3. In Chrome on the same computer, open a unit that has no tag, press
   **Use the USB reader on this computer** under *No tag paired*, and allow
   Chrome to access devices on this computer when it asks. The browser
   remembers this, so next time the unit page connects on its own.
4. Put a blank tag on the reader and press **Pair the tag on the reader**.

The app on `localhost:3000` and the live site are allowed by default. Add
another origin (a deploy preview, say) with `--origin https://…` or
`DESK_READER_ORIGINS=a,b`.

## What it does to a tag

- **Write** refuses a locked tag and a URL bigger than the tag, and only reports
  success after reading the bytes back.
- **Read back** and **lock** carry the uid seen at write time; if a different tag
  is on the reader by then, they refuse rather than verify or lock the wrong one.
- **Lock** is permanent. It only runs on NTAG213/215/216 holding a URL, and sets
  the CC to read-only, then the dynamic lock bytes, then the static lock bytes,
  with the values from the NXP datasheet (rev 3.2, §8.5). Other chips come back
  as "cannot lock" and are left alone.

## Safety

Bound to 127.0.0.1. Requests from any origin not on the list are refused with a
403 before the reader is touched, and the Host header must be loopback, so a
web page elsewhere or a rebinding DNS name cannot drive the reader.

## Tests

```bash
cd packages/nfc-writer/desk-reader && python3 -m unittest -v
```

They run against a simulated NTAG that models the chip's one-time-programmable
lock and CC bytes.
