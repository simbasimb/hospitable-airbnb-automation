# Hospitable Airbnb Listing Automation

Automatically list or unlist your Airbnb properties in Hospitable using GitHub Actions. 

## Setup Instructions

### 1. Configure GitHub Secrets

Go to your repository **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these two secrets:
- `HOSPITABLE_EMAIL` - Your Hospitable login email
- `HOSPITABLE_PASSWORD` - Your Hospitable login password

### 2. Edit Listing Configuration

Edit `toggleListings.js` and update the `listingActions` array with your properties:

```javascript
const listingActions = [
  { propertyName: 'Your Property Name', airbnbListingName: 'Airbnb Listing Name', action: 'list' },
  { propertyName: 'Another Property', airbnbListingName: 'Another Listing', action: 'unlist' }
];
```

### 3. Run the Automation

**Manual Run:**
1. Go to **Actions** tab in your repository
2. Click on "Hospitable Listing Automation"
3. Click "Run workflow" → "Run workflow"

**Automatic Schedule:**
- Runs daily at 3:00 AM Vancouver time (America/Vancouver timezone)

## How It Works

1. Logs into your Hospitable account
2. Navigates to each property's Merge & Match page
3. Finds the Airbnb listing row (ignores VRBO, Booking.com, etc.)
4. Clicks the menu and selects List or Unlist
5. Handles any confirmation modals
6. Saves screenshots and traces on errors

## Troubleshooting

- Check the **Actions** tab for workflow logs
- Error screenshots and traces are uploaded as artifacts
- Make sure your property names and listing names match exactly what's shown in Hospitable
