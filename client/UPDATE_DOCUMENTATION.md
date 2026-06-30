# SoftSpace Auto-Updater Documentation

## Overview

SoftSpace now includes an automatic update system using `electron-updater`. This allows the app to check for updates, download them in the background, and install them without requiring users to manually download and run installers.

## How It Works

### Update Flow

1. **App Startup Check**: When the app starts, it automatically checks for updates
2. **Update Available**: If a new version is found, a custom UI modal appears showing the update
3. **User Action**: User can choose to download the update or install it later
4. **Download**: The update is downloaded in the background with progress indication
5. **Install**: Once downloaded, the user can install the update, which restarts the app

### Components

- **electron/main.js**: Contains the auto-updater configuration and IPC handlers
- **electron/preload.cjs**: Exposes update functions to the renderer process
- **src/components/UpdateManager.tsx**: Custom React UI for update notifications
- **src/electron.d.ts**: TypeScript definitions for the update API

### Configuration

The updater is configured in `package.json`:

```json
{
  "build": {
    "publish": {
      "provider": "generic",
      "url": "https://softspace.cc/api/releases/windows"
    }
  }
}
```

## Creating and Publishing Updates

### Step 1: Update Version Number

Increment the version in `client/package.json`:

```json
{
  "version": "0.2.0"
}
```

### Step 2: Build the Release

Run the build command:

```bash
npm run electron:build
```

This will:
1. Build the React app
2. Package it with Electron
3. Create the installer
4. Generate the update files

### Step 3: Upload to Server

The build process outputs files to `release-buildv3/`. You need to upload:

1. **The ZIP file**: `release-buildv3/SoftSpace-0.2.0.zip` (or your version)
2. **The latest.yml file**: This contains update metadata

Upload these to your server at: `https://softspace.cc/api/releases/windows/`

### Step 4: Update latest.yml

The `latest.yml` file should look like:

```yaml
version: 0.2.0
files:
  - url: SoftSpace-0.2.0.zip
    sha512: <hash>
    size: <size>
path: SoftSpace-0.2.0.zip
sha512: <hash>
releaseDate: <timestamp>
```

Make sure this file is accessible at: `https://softspace.cc/api/releases/windows/latest.yml`

## Testing Updates

### Local Testing

To test updates without deploying to a server:

1. **Create a local update server**:
   - Use a simple HTTP server (like `http-server` or Python's `http.server`)
   - Place your built files in a directory
   - Serve that directory

2. **Configure local feed URL**:
   - In `electron/main.js`, temporarily change:
   ```javascript
   autoUpdater.setFeedURL({
     provider: 'generic',
     url: 'http://localhost:8080' // Your local server
   });
   ```

3. **Build two versions**:
   - Build version 0.1.0 (current)
   - Change version to 0.2.0, build again
   - Place 0.2.0 files on your local server

4. **Test**:
   - Install 0.1.0
   - Start the app
   - The update should be detected
   - Test download and install

### Testing Checklist

- [ ] Update check runs on app startup
- [ ] Update modal appears when update is available
- [ ] Download progress shows correctly
- [ ] Install button appears after download completes
- [ ] App restarts after install
- [ ] New version is running after restart
- [ ] No update notification when already on latest version
- [ ] Error handling works (network issues, server down)

## Server Requirements

Your update server needs to serve:

1. **latest.yml** - Metadata about the latest version
2. **{version}.zip** - The actual update files
3. **CORS headers** - Allow cross-origin requests if needed

Example server structure:

```
https://softspace.cc/api/releases/windows/
├── latest.yml
├── SoftSpace-0.1.0.zip
├── SoftSpace-0.2.0.zip
└── ...
```

## Custom UI Features

The update manager includes a custom React UI with:

- **Language support**: German and English
- **Progress indication**: Shows download percentage and file size
- **Version information**: Displays current and new version
- **Release notes**: Can display release notes if provided
- **Error handling**: Shows error messages with retry option

## Troubleshooting

### Update Not Detected

- Check that `latest.yml` is accessible
- Verify version number in `package.json` is higher than installed version
- Check server URL configuration
- Check network connectivity

### Download Fails

- Verify file exists on server
- Check file permissions
- Ensure sufficient disk space
- Check network connection

### Install Fails

- Ensure app has write permissions
- Check antivirus isn't blocking
- Verify sufficient disk space
- Check for running processes

## Windows Startup Update Check

Currently, the app checks for updates on startup. For Windows startup checks (when Windows starts), you would need to:

1. Add the app to Windows startup folder or registry
2. Configure the app to run minimized on startup
3. Add a scheduled task or use a background service

This is not currently implemented but can be added if needed.

## Installer Language Selector

The installer now includes a language selector as the first step:

- **Default**: English
- **Options**: English, German
- **Effect**: Changes all installer UI text to selected language

The language selection is stored and used throughout the installation process.

## Security Considerations

- Updates are verified using SHA512 hashes
- Files are downloaded over HTTPS (recommended)
- Consider code signing your app for production
- Keep your update server secure

## Future Improvements

Potential enhancements:

- [ ] Background updates without user interaction
- [ ] Delta updates (only download changed files)
- [ ] Update scheduling (check at specific times)
- [ ] Windows startup integration
- [ ] Update history/changelog viewer
- [ ] Automatic rollback on update failure
