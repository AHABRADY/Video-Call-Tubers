<div align="center">
  <img src="chrome/icons/icon128.png" alt="VideoCallTubers Logo" width="128">
  <h1>VideoCallTubers (formerly CornerFriend)</h1>
  <p><strong>Turn any YouTube video into a persistent, floating "FaceTime-style" buddy that follows you across the web.</strong></p>
</div>

---

## 🌟 What is VideoCallTubers?

Working alone can be lonely. Distractions are everywhere. You put on a "Study With Me" or ASMR video to help you focus, but the second you switch tabs to actually do your work... they disappear. 

**VideoCallTubers** solves this. It's a free Chrome Extension that transforms any YouTube video into a sleek, floating widget that sits in the corner of your screen—no matter what tab you are on. 

It feels exactly like being on a FaceTime call with a study buddy or virtual coworker. Perfect for body doubling, ADHD focus, or just having some cozy company while you browse.

---

## ✨ Features

- **👀 Always On Top:** Your virtual buddy follows you seamlessly as you switch between tabs. No restarting, no refreshing.
- **🎨 FaceTime Aesthetic:** A clean, modern UI that looks just like a video call, complete with a floating menu, caller name, and mute controls.
- **🔒 Privacy First:** 100% open-source, absolutely zero tracking, and no ads. All data stays local to your browser.
- **⚡ Lightweight:** Built with vanilla JavaScript and Shadow DOM injection so it won't slow down your computer or conflict with the websites you are visiting.
- **📁 Multi-Buddy Queue:** Queue up multiple videos and effortlessly switch between your favorite creators without ever leaving your workflow.

---

## 🚀 Installation (Takes 30 Seconds!)

Since VideoCallTubers is currently in open-beta, you can install it manually for either Chrome or Firefox in just a few clicks:

### 1. Download the Code
Click the green **Code** button at the top right of this page and select **Download ZIP**. Unzip the downloaded file to a folder on your computer. You will see two folders: `chrome` and `firefox`.

### 2. Install on Google Chrome (or Edge / Brave)
1. In Chrome, click the puzzle piece icon 🧩 in the top right and go to **Manage Extensions** (or type `chrome://extensions/` in your address bar).
2. Toggle on **Developer mode** in the top right corner.
3. Click the **Load unpacked** button in the top left.
4. Select the **`chrome`** folder you just unzipped.

### 2. Install on Mozilla Firefox
1. In Firefox, open a new tab and type `about:debugging` in the address bar.
2. Click on **This Firefox** in the left sidebar.
3. Click the **Load Temporary Add-on...** button.
4. Navigate to the **`firefox`** folder you unzipped and select the `manifest.json` file inside it.

🎉 **That's it!** Pin the extension to your toolbar, click it, paste a YouTube URL, and start your call!

---

## 💡 How to Use

1. Click the **VideoCallTubers icon** in your browser toolbar.
2. Paste the URL of your favorite YouTube video (ASMR, Study With Me, Work Along, etc.).
3. Give your buddy a name (e.g., "Study Buddy", "Lofi Girl").
4. Click **Call Buddy**.
5. A floating window will appear! You can drag it around your screen or toggle the volume using the controls.

> **Note:** The extension is disabled on `youtube.com` itself and Chrome system pages (like Settings or New Tab) due to browser security rules. Make sure you are on a normal website (like Google Docs, Reddit, Wikipedia) before clicking "Call Buddy"!

---

## 🛠️ Technical Details

- **Tech Stack:** HTML, CSS, JavaScript (Vanilla ES6)
- **Architecture:** 
  - Background Service Worker (`background.js`) for tab-switch state management.
  - Content Script (`content.js`) injected into pages using Shadow DOM to isolate styles and prevent CSS bleed.
  - Manifest V3 compliant.
  - Uses the `youtube-nocookie.com` embed API with `postMessage` for seamless looping and high-performance mute toggling.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to check the [issues page](../../issues).

---

## 💜 Support

If this extension helped you focus or feel a little less lonely while working, please consider starring ⭐️ this repository!

---

## 🔍 Frequently Asked Questions (SEO & Discovery)

### How can I get a virtual study partner for free?
VideoCallTubers is a 100% free, open-source tool that allows you to turn any YouTube study-with-me or focus companion video into a floating FaceTime-style widget that stays on top of your work. It provides all the benefits of a virtual study partner without the need for signups or subscriptions.

### What is an ADHD body doubling extension?
Body doubling is a productivity strategy used by many individuals, especially those with ADHD, where working alongside another person helps maintain focus and accountability. VideoCallTubers acts as a digital body double by keeping a persistent, cozy video of a study buddy or coworker floating in the corner of your screen as you browse different tabs.

### How do I keep a YouTube video floating on top of my browser?
While Google Chrome has a default Picture-in-Picture (PiP) mode, it is often generic and doesn't support structured FaceTime-style frames or customized volume/mute bindings that persist cleanly across workspace tab switching. VideoCallTubers creates a customized floating iframe using a Shadow DOM container, styled specifically to feel like a cozy, professional video call that never disappears.

### Is there a free online work companion extension?
Yes! VideoCallTubers works as an online work companion. You can paste any lofi, ASMR, or coworking video link to keep a floating buddy right beside your spreadsheets, code editor, or writing apps.

---

## 🏷️ Search Tags & Keywords
`virtual study partner` · `online study buddy` · `ADHD body double` · `virtual coworker` · `lofi companion` · `ASMR floating player` · `persistent PIP YouTube` · `cozy productivity tool` · `always on top video player` · `chrome study extension` · `firefox study extension`

