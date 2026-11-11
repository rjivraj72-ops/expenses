# Backend (Google Apps Script)

`Code.gs` is the copy of the script attached to the Granola Kid Google Sheet, kept in this repo for backup and review. GitHub doesn't deploy it. You paste it into Apps Script yourself.

## Deploying a change

1. **Set the PIN first (one time only).** In the Apps Script editor, go to ⚙️ Project Settings → Script Properties → Add script property. Set the name to `APP_PIN` and the value to your PIN. If this property is missing, the app shows "PIN isn't set up on the server".
2. Open `Code.gs` in the editor, select everything, and paste in the version from this repo.
3. Click **Deploy → Manage deployments**, then the ✏️ pencil on the existing deployment. Under **Version**, pick **New version**, then click **Deploy**.
   - Don't use "New deployment". That creates a new URL, and the app would stop working.
4. Open the app, unlock it, and add and delete a test expense.

## What it does

- **PIN:** the PIN is read from Script Properties, so it never appears in GitHub.
- **Wrong-PIN limit:** after 10 wrong PINs within 15 minutes, all PIN attempts are refused until the 15 minutes pass. Apps Script can't tell callers apart, so this lockout applies to you too. That trade-off is what stops anyone guessing the PIN.
- **GST:** the backend saves 5% GST when the app sends "GST charged" and $0 when it sends "No GST". Older versions of the app that don't send a choice get 5%, the same as before.
- **Row safety:** deleting, editing, paying and attaching receipts all check that the row still holds the expected transaction. If it doesn't, nothing changes and the app refreshes.
- **One change at a time:** a script lock stops two quick saves from writing to the same row.
- **Errors:** errors come back as JSON, so the app shows a message instead of a false "✓ Added".
- **Year:** "GST paid YTD" uses the current year automatically.

## Receipts

Uploaded receipts are shared as "anyone with the link can view", because the app displays them as images. The links are long and random, but anyone who has one can open the receipt.
