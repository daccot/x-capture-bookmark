# X Capture Bookmark

X Capture Bookmark is a Chrome Extension that lets you manually save selected posts from X (formerly Twitter), organize them locally, and export them as CSV, Markdown, or HTML.

## Features

- Save selected X posts with one click
- Fully local storage using IndexedDB
- Folder-based organization
- Personal memo field
- Tile view and spreadsheet-like list view
- Sort by saved date or posted date
- Group by author or folder
- Export as CSV, Markdown, or HTML
- Optional post-card image generation
- Japanese / English UI switching
- Default language follows Chrome UI language

## Privacy-first design

This extension stores saved posts and settings locally in your browser. It does not send saved data to any external server.

## Installation for local testing

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select the extension folder.
6. Open `https://x.com` and reload the page.

## How to use

1. Hover over a post on X.
2. Click the `📌 Save` button.
3. Open the extension popup.
4. Organize saved posts using folders and memos.
5. Export the current view as CSV, Markdown, or HTML.

## Permissions

### storage

Used to save user-selected posts, settings, folders, and memos locally in the browser.

### tabs

Used to open saved posts in a new browser tab when the user selects the Open action.

### downloads

Used to export saved posts as local CSV, Markdown, or HTML files.

### Host permissions for x.com and twitter.com

Used to detect posts on X pages and add a save button to selected posts. The extension only interacts with page content necessary for this feature.

## Notes

- Some media may not be available due to browser or website restrictions.
- The extension is designed to save user-selected posts, not to automatically collect timeline content.
- All exported files are generated locally in the browser.

## License

MIT
