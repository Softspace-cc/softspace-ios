# Softspace iOS App

Since you are running Windows, compiling Xcode projects natively is not possible (as Apple requires macOS for native Xcode compilation). 

To work around this, we have set up a **GitHub Actions CI/CD Workflow** that builds the iOS `.ipa` binary for you in the cloud, which you can then easily **sideload** onto your iPhone.

---

## How to Build the App (GitHub Actions)

1. Push this project to your GitHub repository (including the new `.github/workflows/build-ios.yml` file).
2. Go to the **Actions** tab of your repository on GitHub.
3. Select the **Build iOS IPA** workflow from the left sidebar.
4. Click **Run workflow** -> Select your branch -> Click **Run workflow**.
5. Once the run finishes, scroll to the bottom of the page and download the **`Softspace-iOS-Unsigned-IPA`** artifact. This contains `Softspace.ipa`.

---

## How to Sideload & Test on Your iPhone

You can install the `.ipa` file onto your iPhone without a paid developer account using either **Sideloadly** or **AltStore**.

### Option A: Sideloadly (Easiest on Windows)
1. Download and install [Sideloadly](https://sideloadly.io/) on your Windows PC.
2. Connect your iPhone to your PC via USB and make sure iTunes recognizes it.
3. Open Sideloadly:
   * Drag and drop the downloaded `Softspace.ipa` file into the **IPA** box.
   * Enter your Apple ID email address in the **Apple Account** field.
   * Click **Start**.
4. Enter your Apple ID password if prompted (this securely logs into Apple's developer servers to generate a free developer certificate for your device).
5. Once it says **Done**, the Softspace app will appear on your iPhone home screen!
6. On your iPhone, go to **Settings** -> **General** -> **VPN & Device Management**, tap your Apple ID under "Developer App", and tap **Trust**.
7. Enable **Developer Mode** on your iPhone: Go to **Settings** -> **Privacy & Security** -> Scroll down to **Developer Mode** and turn it on, then restart your device.

### Option B: AltStore (Wireless Auto-Signing)
1. Install [AltServer](https://altstore.io/) on your Windows PC.
2. Follow the AltStore installation instructions to install AltStore onto your iPhone.
3. Open AltStore on your iPhone, go to "My Apps", tap the `+` button in the top-left, and select the `Softspace.ipa` file.
4. AltStore will sign and install the app wirelessly over your local network!
